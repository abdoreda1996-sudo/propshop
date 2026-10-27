import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/offer.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/offer_widgets.dart';
import 'messages_screen.dart';
import 'viewings_screen.dart';

/// Offers, the app's twin of /dashboard/offers. Viewings have their own screen
/// (ViewingsScreen), reached from the app bar here and from Account, as on the web.
///
/// Both sides of the table in one place, sorted by whose move it is. A user who owns a
/// unit and is also shopping sees both here; there is no separate "seller app".
///
/// This screen lives in the home tab stack, so it is built at app start, before the
/// session has read its tokens. It therefore loads only once a user is signed in, and
/// again whenever the signed-in user changes, instead of firing a 401 at startup and
/// keeping "sign in" on screen after the user did.
class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  List<OfferChain> _chains = [];
  bool _loading = true;
  String? _error;

  /// The user the list was loaded for; a different one (or a sign-out) reloads it.
  String? _loadedFor;

  void _syncWithSession(SessionController session) {
    final id = session.isSignedIn ? (session.user?['id'] as String? ?? '') : null;
    if (session.loading || id == _loadedFor) return;
    _loadedFor = id;
    if (id == null) {
      _chains = [];
      _error = null;
      _loading = false;
      return;
    }
    // After this frame: build is not the place to call setState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    if (!context.read<SessionController>().isSignedIn) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await context.read<Api>().offers();
      if (!mounted) return;
      setState(() {
        _chains = ((json['chains'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(OfferChain.fromJson)
            .toList();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'unauthorized') {
        // The session expired under us: let the session decide what to show.
        context.read<SessionController>().refresh();
      } else {
        setState(() => _error = tr('مش قادرين نحمّل العروض دلوقتي.', "We couldn't load your offers right now."));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Returns an error message, or null on success. The tile shows it inline rather than
  /// a snackbar so it sits beside the action that failed.
  Future<String?> _actOnOffer(OfferChain chain, String action, double? amount) async {
    final live = chain.liveStep;
    if (live == null) {
      return tr('العرض ده مابقاش ساري.', 'This offer is no longer open.');
    }
    try {
      await context.read<Api>().respondToOffer(live.id, action, amount: amount);
      if (!mounted) return null;
      await _load();
      // The tab badges count offers waiting on this user.
      if (mounted) context.read<SessionController>().refresh();
      return null;
    } on ApiException catch (e) {
      // The server sends human copy in both languages; prefer it over a code.
      return (e.body?[isEn ? 'messageEn' : 'messageAr'] as String?) ??
          tr('مش قادرين ننفذ ده (${e.code}).', "We couldn't do that (${e.code}).");
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    _syncWithSession(session);

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('العروض', 'Offers')),
        actions: [
          if (session.isSignedIn) ...[
            IconButton(
              tooltip: tr('المعاينات', 'Viewings'),
              icon: const Icon(Icons.event_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ViewingsScreen())),
            ),
            // Messages sits here rather than taking a sixth tab: it is where a negotiation
            // is discussed, so it belongs beside the negotiation.
            IconButton(
              tooltip: tr('الرسايل', 'Messages'),
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MessagesScreen())),
            ),
          ],
          const LangToggleButton(),
        ],
      ),
      body: _body(session),
    );
  }

  Widget _body(SessionController session) {
    if (session.loading && !session.isSignedIn) {
      return const Center(child: CircularProgressIndicator());
    }
    if (!session.isSignedIn) {
      return SignInPrompt(
        title: tr('عروضك هتظهر هنا', 'Your offers show up here'),
        body: tr(
          'سجّل دخولك عشان تشوف العروض اللي قدمتها على وحدات، والعروض اللي جاتلك على وحدتك.',
          'Sign in to see the offers you made on units and the offers made on yours.',
        ),
      );
    }
    if (_error != null && _chains.isEmpty) return ErrorNotice(message: _error!, onRetry: _load);
    if (_loading && _chains.isEmpty) return const Center(child: CircularProgressIndicator());

    // Anything waiting on this user comes first; that is the only sort that matters.
    final mine = _chains.where((c) => c.myMove).toList();
    final waiting = _chains.where((c) => c.awaiting != null && !c.myMove).toList();
    final settled = _chains.where((c) => c.awaiting == null).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: _chains.isEmpty
          ? pullable(
              EmptyState(
                  title: tr('لسه مافيش عروض', 'No offers yet'),
                  body: tr(
                    'لما تلاقي وحدة عاجباك، قدّم عرضك من صفحتها. من غير سمسار ومن غير مكالمات.',
                    'When you find a unit you like, make an offer from its page. No broker, no phone calls.',
                  ),
                ),
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                ..._group(tr('محتاجة ردك', 'Needs your reply'), mine, count: true),
                ..._group(tr('مستنية رد الطرف التاني', 'Waiting for the other side'), waiting),
                ..._group(tr('خلصت', 'Closed'), settled),
              ],
            ),
    );
  }

  List<Widget> _group(String title, List<OfferChain> chains, {bool count = false}) {
    if (chains.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 2),
        child: Text(
          count ? '$title (${chains.length})' : title,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: count ? AqarColors.accent600 : AqarColors.ink500,
            fontFeatures: AqarType.tnum,
          ),
        ),
      ),
      for (var i = 0; i < chains.length; i++) ...[
        OfferChainTile(
          key: ValueKey('${chains[i].listingId}-${chains[i].steps.isEmpty ? '' : chains[i].steps.first.id}'),
          chain: chains[i],
          onAct: (action, {amount}) => _actOnOffer(chains[i], action, amount),
        ),
        if (i < chains.length - 1) const Divider(),
      ],
      const Divider(color: AqarColors.ink200),
    ];
  }
}
