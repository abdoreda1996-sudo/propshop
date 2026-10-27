import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../screens/login_screen.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';

/// The top trailing corner of the home hero — the app's twin of the website's
/// AccountBox / GuestBox:
///   signed in  → "Welcome Ahmed" over "Dashboard", tapping opens the Account tab
///   signed out → one box holding "Log in" and "Sign up" (both the phone-OTP flow; a new
///                number is asked for a name, so sign-up only changes the heading)
///
/// Sits on the white hero: ink type, with "Sign up" as the forest outline.
class AccountCorner extends StatelessWidget {
  const AccountCorner({super.key, required this.onOpenDashboard});

  final VoidCallback onOpenDashboard;

  /// "عبد الرحمن" / "Abdel Rahman" are one name in two words.
  static String firstName(String full) {
    final parts = full.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return full;
    if (parts.length > 1 &&
        RegExp(r'^(عبد|ابو|أبو|abd|abdel|abdul|abu)$', caseSensitive: false).hasMatch(parts.first)) {
      return '${parts[0]} ${parts[1]}';
    }
    return parts.first;
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    // Nothing while /me is in flight — flashing "Log in" at a signed-in user is worse.
    if (session.loading && !session.isSignedIn) return const SizedBox(width: 8);

    if (session.isSignedIn) {
      // Plain text, no box: the first name, and "Account" under it in rust.
      return InkWell(
        onTap: onOpenDashboard,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 140),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                tr('أهلاً، ${firstName(session.fullName)}', 'Hi, ${firstName(session.fullName)}'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AqarColors.ink900, height: 1.25),
              ),
              Text(
                tr('حسابي', 'My account'),
                style: const TextStyle(fontSize: 11.5, color: AqarColors.accent600, height: 1.25),
              ),
            ],
          ),
        ),
      );
    }

    void openLogin({required bool signup}) =>
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => LoginScreen(signup: signup, toHome: true)));

    return Container(
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton(
            onPressed: () => openLogin(signup: false),
            style: TextButton.styleFrom(
              foregroundColor: AqarColors.ink700,
              minimumSize: const Size(0, 30),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              visualDensity: VisualDensity.compact,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(tr('دخول', 'Log in'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          FilledButton(
            onPressed: () => openLogin(signup: true),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 34),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              visualDensity: VisualDensity.compact,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(tr('حساب جديد', 'Sign up'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
