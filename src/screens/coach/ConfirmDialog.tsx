// The confirm dialog the coach's chats and settings use (and the update prompt, whose release notes scroll inside it):
// iOS's alert (src/ui/components/Alert.tsx), the title and a grey sentence over the action (red when it removes
// something, filled blue otherwise) and Cancel, popping in on a spring and fading out. The caller owns `pending`.
import * as React from "react";
import { AlertDialog, fitsRow } from "@/ui/components/Alert";

export function ConfirmDialog({
  open,
  title,
  description,
  confirm,
  cancel = "Cancel",
  pendingLabel,
  danger = true,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirm: string;
  /** The lower button's label. */
  cancel?: string;
  pendingLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      locked={pending}
      title={title}
      message={description}
      // Decided from the resting labels, so the buttons keep their places while the pending label runs.
      layout={fitsRow([cancel, confirm]) ? "row" : "stack"}
      actions={[
        { label: cancel, style: "cancel", onPress: () => !pending && onClose(), disabled: pending },
        { label: pending && pendingLabel ? pendingLabel : confirm, style: danger ? "destructive" : "default", onPress: onConfirm, disabled: pending, busy: pending },
      ]}
    />
  );
}
