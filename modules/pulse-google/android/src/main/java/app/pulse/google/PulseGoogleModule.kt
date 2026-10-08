package app.pulse.google

import android.accounts.Account
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google sign-in for the Google Health API with no client secret and no refresh token on the phone: Google Identity
 * Services' AuthorizationClient asks Google Play services for an OAuth access token for the requested scopes. Google
 * finds the app's Android OAuth client by package name and signing certificate (SHA-1), so there is no client ID here.
 *
 * A token lasts about an hour. authorize(scopes, interactive = false) is the silent re-auth before each sync: it hands
 * back a fresh token without any UI while the grant stands, and fails with ERR_NEEDS_SIGN_IN when Google wants the
 * person to consent again. Given the account's email, it asks for that account (a phone with several Google accounts
 * then never needs the picker). Interactive, it opens Google's account picker and consent screen (the result's
 * PendingIntent) and finishes in OnActivityResult with getAuthorizationResultFromIntent.
 *
 * Every failure rejects with one of these codes (index.ts turns them into GoogleSignInError):
 *   ERR_NOT_CONFIGURED     no Android OAuth client matches this package and SHA-1 (DEVELOPER_ERROR)
 *   ERR_CANCELLED          the person backed out of the consent screen
 *   ERR_NO_PLAY_SERVICES   Google Play services missing, disabled, updating or too old
 *   ERR_SCOPE_NOT_GRANTED  Google granted none of the requested scopes, or no token
 *   ERR_NEEDS_SIGN_IN      the silent call needs the consent screen (a new scope, an expired or revoked grant)
 *   ERR_NO_ACTIVITY        an interactive call with no activity on screen to show the consent screen from
 *   ERR_NETWORK            Google could not be reached
 *   ERR_AUTHORIZE_FAILED   anything else, with Google's status code in the message
 */
class PulseGoogleModule : Module() {
  private class Pending(val promise: Promise, val scopes: List<String>)

  /** The interactive authorize() waiting for Google's consent screen to come back (OnActivityResult). */
  private var pending: Pending? = null

  override fun definition() = ModuleDefinition {
    Name("PulseGoogle")

    Function("playServices") { playServices() }

    AsyncFunction("authorize") { scopes: List<String>, interactive: Boolean, account: String?, promise: Promise ->
      authorize(scopes, interactive, account, promise)
    }

    AsyncFunction("clearToken") { token: String, promise: Promise ->
      clearToken(token, promise)
    }

    AsyncFunction("revokeAccess") { scopes: List<String>, email: String, promise: Promise ->
      revokeAccess(scopes, email, promise)
    }

    OnActivityResult { activity, payload ->
      if (payload.requestCode == REQUEST_AUTHORIZE) finishConsent(activity, payload.resultCode, payload.data)
    }
  }

  /** The activity on screen when there is one (the consent screen starts from it), else the app's context. */
  private fun context(): Context? = appContext.currentActivity ?: appContext.reactContext

  private fun authorize(scopes: List<String>, interactive: Boolean, account: String?, promise: Promise) {
    val ctx = context() ?: return promise.reject(err("ERR_AUTHORIZE_FAILED", "Halo isn't ready to sign in yet."))
    playServicesError()?.let { return promise.reject(it) }
    if (scopes.isEmpty()) return promise.reject(err("ERR_SCOPE_NOT_GRANTED", "No Google scopes were requested."))
    val builder = AuthorizationRequest.builder().setRequestedScopes(scopes.map { Scope(it) })
    if (!account.isNullOrEmpty()) builder.setAccount(Account(account, "com.google"))
    val request = builder.build()
    Identity.getAuthorizationClient(ctx)
      .authorize(request)
      .addOnSuccessListener { result -> onAuthorized(result, scopes, interactive, promise) }
      .addOnFailureListener { e -> promise.reject(mapError(e)) }
  }

  /** On the main thread (Play services' listeners run there), as starting the consent screen must be. */
  private fun onAuthorized(result: AuthorizationResult, scopes: List<String>, interactive: Boolean, promise: Promise) {
    if (!result.hasResolution()) return settle(result, scopes, promise)
    if (!interactive) {
      return promise.reject(err("ERR_NEEDS_SIGN_IN", "Google needs you to sign in again before Halo can read your data."))
    }
    val activity = appContext.currentActivity
      ?: return promise.reject(err("ERR_NO_ACTIVITY", "Open Halo to sign in with Google."))
    val intent = result.pendingIntent
      ?: return promise.reject(err("ERR_AUTHORIZE_FAILED", "Google returned no consent screen."))
    // A consent screen whose answer never came back (its activity was recreated) gives way to the new one.
    pending?.promise?.reject(err("ERR_CANCELLED", "Replaced by a newer sign-in."))
    pending = Pending(promise, scopes)
    try {
      @Suppress("DEPRECATION")
      activity.startIntentSenderForResult(intent.intentSender, REQUEST_AUTHORIZE, null, 0, 0, 0)
    } catch (e: IntentSender.SendIntentException) {
      pending = null
      promise.reject(err("ERR_AUTHORIZE_FAILED", "Couldn't open Google's consent screen.", e))
    }
  }

  /** The consent screen's answer. */
  private fun finishConsent(activity: Activity, resultCode: Int, data: Intent?) {
    val p = pending ?: return
    pending = null
    if (data == null) {
      return p.promise.reject(
        if (resultCode == Activity.RESULT_CANCELED) err("ERR_CANCELLED", "Google sign-in was cancelled.")
        else err("ERR_AUTHORIZE_FAILED", "Google's consent screen returned nothing.")
      )
    }
    try {
      settle(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data), p.scopes, p.promise)
    } catch (e: Exception) {
      p.promise.reject(mapError(e))
    }
  }

  /** Resolves `{ accessToken, grantedScopes }`, or rejects when Google granted none of what was asked. */
  private fun settle(result: AuthorizationResult, requested: List<String>, promise: Promise) {
    val token = result.accessToken
    val granted = result.grantedScopes ?: emptyList()
    if (token.isNullOrEmpty() || requested.none { it in granted }) {
      return promise.reject(err("ERR_SCOPE_NOT_GRANTED", "Google didn't grant Halo access to the requested data."))
    }
    promise.resolve(mapOf("accessToken" to token, "grantedScopes" to granted))
  }

  /** Drops a token from Play services' cache (after the API answered 401), so the next authorize() mints a new one. */
  private fun clearToken(token: String, promise: Promise) {
    val ctx = context() ?: return promise.reject(err("ERR_AUTHORIZE_FAILED", "Halo isn't ready yet."))
    Identity.getAuthorizationClient(ctx)
      .clearToken(ClearTokenRequest.builder().setToken(token).build())
      .addOnSuccessListener { promise.resolve(true) }
      .addOnFailureListener { e -> promise.reject(mapError(e)) }
  }

  /** Revokes every scope the account granted Pulse (Google removes the app from the account's third-party access). */
  private fun revokeAccess(scopes: List<String>, email: String, promise: Promise) {
    val ctx = context() ?: return promise.reject(err("ERR_AUTHORIZE_FAILED", "Halo isn't ready yet."))
    playServicesError()?.let { return promise.reject(it) }
    val request = RevokeAccessRequest.builder()
      .setAccount(Account(email, "com.google"))
      .setScopes(scopes.map { Scope(it) })
      .build()
    Identity.getAuthorizationClient(ctx)
      .revokeAccess(request)
      .addOnSuccessListener { promise.resolve(true) }
      .addOnFailureListener { e -> promise.reject(mapError(e)) }
  }

  /** Google Play services' state on this phone, as index.ts's PlayServices. */
  private fun playServices(): String {
    val ctx = context() ?: return "unknown"
    return when (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx)) {
      ConnectionResult.SUCCESS -> "available"
      ConnectionResult.SERVICE_MISSING -> "missing"
      ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED -> "update_required"
      ConnectionResult.SERVICE_UPDATING -> "updating"
      ConnectionResult.SERVICE_DISABLED -> "disabled"
      ConnectionResult.SERVICE_INVALID -> "invalid"
      else -> "unknown"
    }
  }

  private fun playServicesError(): CodedException? = when (playServices()) {
    "missing", "invalid" -> err("ERR_NO_PLAY_SERVICES", "Google Play services isn't on this phone.")
    "update_required" -> err("ERR_NO_PLAY_SERVICES", "Google Play services needs an update.")
    "updating" -> err("ERR_NO_PLAY_SERVICES", "Google Play services is updating. Try again in a minute.")
    "disabled" -> err("ERR_NO_PLAY_SERVICES", "Google Play services is turned off.")
    else -> null
  }

  private fun mapError(e: Exception): CodedException {
    if (e !is ApiException) return err("ERR_AUTHORIZE_FAILED", e.message ?: "Google sign-in failed.", e)
    val code = e.statusCode
    val text = e.message ?: ""
    return when {
      // No OAuth client for this package and certificate. Google says DEVELOPER_ERROR (10), sometimes with its
      // "[28444] Developer console is not set up correctly" text under another code.
      code == DEVELOPER_ERROR || text.contains("28444") || text.contains("Developer console", ignoreCase = true) ->
        err("ERR_NOT_CONFIGURED", "Google sign-in isn't set up for this app (status $code).", e)
      code == CANCELED || code == SIGN_IN_CANCELLED -> err("ERR_CANCELLED", "Google sign-in was cancelled.", e)
      code in PLAY_SERVICES_CODES -> err("ERR_NO_PLAY_SERVICES", "Google Play services isn't usable on this phone (status $code).", e)
      code == NETWORK_ERROR || code == TIMEOUT -> err("ERR_NETWORK", "Couldn't reach Google.", e)
      code == SIGN_IN_REQUIRED || code == RESOLUTION_REQUIRED -> err("ERR_NEEDS_SIGN_IN", "Google needs you to sign in again.", e)
      else -> err("ERR_AUTHORIZE_FAILED", "Google sign-in failed (status $code).", e)
    }
  }

  private fun err(code: String, message: String, cause: Throwable? = null) = CodedException(code, message, cause)

  companion object {
    /** startIntentSenderForResult's request code for Google's consent screen (16 bits, as FragmentActivity wants). */
    private const val REQUEST_AUTHORIZE = 0x6A71

    // CommonStatusCodes and GoogleSignInStatusCodes, by value.
    private const val SIGN_IN_REQUIRED = 4
    private const val RESOLUTION_REQUIRED = 6
    private const val NETWORK_ERROR = 7
    private const val DEVELOPER_ERROR = 10
    private const val TIMEOUT = 15
    private const val CANCELED = 16
    private const val SIGN_IN_CANCELLED = 12501

    /** ConnectionResult's Play services states, as an ApiException carries them. */
    private val PLAY_SERVICES_CODES = setOf(1, 2, 3, 9, 18, 19)
  }
}
