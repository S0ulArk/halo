// Mobile addition: where moderate activity starts on heart-rate reserve, shared by Pulse Age's moderate-activity input
// (stage 1's `moderateSeconds`) and the derived Active Zone Minutes (src/health/derive.ts), so the two agree on what a
// brisk walk is. 40 % of reserve is ACSM's moderate floor (Garber et al. 2011, Med Sci Sports Exerc 43:1334, Table 2:
// moderate 40–59 % HRR) and Fitbit's fat burn zone (Google Health Help: 40–59 % of heart-rate reserve).
export const MODERATE_FROM_HRR = 0.4;
