import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/deal.dart';
import '../models/offer.dart';
import '../services/api.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/offer_widgets.dart';

/// Viewings — the app's twin of /dashboard/viewings (moved out of Offers on the web on
/// 2026-10-01, and here on 2026-10-02). Buying and selling together, sorted by whose move
/// it is: what needs my answer, then what is booked, then history.
class ViewingsScreen extends StatefulWidget {
  const ViewingsScreen({super.key});
  @override
  State<ViewingsScreen> createState() => _ViewingsScreenState();
}

/// Whose move a viewing is. The owner answers a request; the buyer answers a proposal.
bool viewingAwaitsMe(Viewing v) =>
    (v.role == OfferSide.seller && v.status == 'requested') ||
    (v.role == OfferSide.buyer && v.status == 'proposed');

class _ViewingsScreenState extends State<ViewingsScreen> {
  List<Viewing> _viewings = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final j = await context.read<Api>().viewings();
      if (!mounted) return;
      setState(() => _viewings = ((j['viewings'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(Viewing.fromJson)
          .toList());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code == 'unauthorized'
          ? tr('سجّل دخولك عشان تشوف معايناتك.', 'Sign in to see your viewings.')
          : tr('مش قادرين نحمّل المعاينات دلوقتي.', "We couldn't load your viewings right now."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _act(Viewing v, String action, DateTime? at) async {
    try {
      await context.read<Api>().respondToViewing(v.id, action, at: at);
      await _load();
      return null;
    } on ApiException catch (e) {
      return (e.body?[isEn ? 'messageEn' : 'messageAr'] as String?) ??
          tr('مش قادرين ننفذ ده (${e.code}).', "We couldn't do that (${e.code}).");
    }
  }

  @override
  Widget build(BuildContext context) {
    final needsMe = _viewings.where(viewingAwaitsMe).toList();
    final booked = _viewings.where((v) => v.isOpen && !viewingAwaitsMe(v)).toList();
    final past = _viewings.where((v) => !v.isOpen).toList();

    Widget body;
    if (_error != null) {
      body = ErrorNotice(message: _error!, onRetry: _load);
    } else if (_loading && _viewings.isEmpty) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_viewings.isEmpty) {
      body = ListView(children: [
        EmptyState(
          title: tr('لسه مافيش معاينات', 'No viewings yet'),
          body: tr(
            'اطلب معاينة من صفحة أي وحدة. الأسماء والأرقام بتظهر بس بعد تأكيد الميعاد.',
            'Request a viewing from any unit. Names and numbers appear only once a time is confirmed.',
          ),
        ),
      ]);
    } else {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          ..._section(tr('محتاجة ردك', 'Needs your reply'), needsMe),
          ..._section(tr('متأكدة أو مستنية رد', 'Booked or waiting'), booked),
          ..._section(tr('اللي فاتت', 'Past'), past),
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(tr('المعاينات', 'Viewings')), actions: const [LangToggleButton()]),
      body: RefreshIndicator(onRefresh: _load, child: body),
    );
  }

  List<Widget> _section(String title, List<Viewing> rows) {
    if (rows.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 8),
        child: Text('$title (${rows.length})',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
      ),
      for (final v in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ViewingTile(viewing: v, onAct: (action, {at}) => _act(v, action, at)),
        ),
    ];
  }
}
