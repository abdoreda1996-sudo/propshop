import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../screens/login_screen.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';

/// The heart on a listing — the app's twin of the website's SaveButton, on the same
/// /api/saved endpoint. Signed out, a tap opens sign-in.
///
/// Degrades to a plain icon where no SessionController is provided (widget tests render
/// cards in isolation), rather than throwing.
class SaveHeart extends StatelessWidget {
  const SaveHeart({super.key, required this.listingId, this.size = 18});
  final String listingId;
  final double size;

  @override
  Widget build(BuildContext context) {
    SessionController? session;
    try {
      session = context.watch<SessionController>();
    } on ProviderNotFoundException {
      session = null;
    }
    final saved = session?.isSaved(listingId) ?? false;
    return IconButton(
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      tooltip: saved ? tr('شيل من المحفوظة', 'Remove from saved') : tr('احفظ', 'Save'),
      icon: Icon(saved ? Icons.favorite : Icons.favorite_border, size: size, color: saved ? AqarColors.accent500 : AqarColors.ink400),
      onPressed: session == null
          ? null
          : () async {
              final s = session!;
              if (!s.isSignedIn) {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
                return;
              }
              await s.toggleSaved(listingId);
            },
    );
  }
}
