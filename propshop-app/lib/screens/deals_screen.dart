import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/deal.dart';
import '../models/offer.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/offer_widgets.dart';
import 'deal_screen.dart';

/// Every deal this user is part of, buying or selling: the app's twin of
/// /dashboard/deals.
///
/// Like Offers, it sits in the home tab stack and is built before the session is known,
/// so it loads once a user is signed in and again whenever that user changes.
class DealsScreen extends StatefulWidget {
  const DealsScreen({super.key});

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  List<Deal> _deals = [];
  bool _loading = true;
  String? _error;
  String? _loadedFor;

  void _syncWithSession(SessionController session) {
    final id = session.isSignedIn ? (session.user?['id'] as String? ?? '') : null;
    if (session.loading || id == _loadedFor) return;
    _loadedFor = id;
    if (id == null) {
      _deals = [];
      _error = null;
      _loading = false;
      return;
    }
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
      final json = await context.read<Api>().deals();
      if (!mounted) return;
      setState(
        () => _deals = ((json['deals'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(Deal.fromJson)
            .toList(),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'unauthorized') {
        context.read<SessionController>().refresh();
      } else {
        setState(() => _error = tr('مش قادرين نحمّل الصفقات دلوقتي.', "We couldn't load your deals right now."));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    _syncWithSession(session);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('الصفقات', 'Deals')),
        actions: const [LangToggleButton()],
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
        title: tr('صفقاتك هتظهر هنا', 'Your deals show up here'),
        body: tr(
          'أول ما عرض يتقبل بيتفتح له صفقة: الحجز ومراجعة المستندات والعقد ونقل الملكية. سجّل دخولك عشان تتابعها.',
          'Once an offer is accepted it becomes a deal: reservation, document review, contract and transfer. Sign in to follow yours.',
        ),
      );
    }
    if (_error != null && _deals.isEmpty) return ErrorNotice(message: _error!, onRetry: _load);
    if (_loading && _deals.isEmpty) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _load,
      child: _deals.isEmpty
          ? pullable(
              EmptyState(
                title: tr('مافيش صفقات لسه', 'No deals yet'),
                body: tr(
                  'أول ما عرض يتقبل، هتلاقي الصفقة هنا بكل خطواتها.',
                  'As soon as an offer is accepted, the deal and all its steps appear here.',
                ),
              ),
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              itemCount: _deals.length,
              separatorBuilder: (_, __) => const Divider(),
              itemBuilder: (_, i) => _DealTile(
                deal: _deals[i],
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => DealScreen(reference: _deals[i].reference)),
                  );
                  if (mounted) _load();
                },
              ),
            ),
    );
  }
}

/// One deal as a list row: title and price, then where it stands.
class _DealTile extends StatelessWidget {
  const _DealTile({required this.deal, required this.onTap});
  final Deal deal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (done, total) = deal.progress;
    final hold = deal.holdRemaining;
    final cancelled = deal.stage == 'cancelled';

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    deal.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, height: 1.35, fontWeight: FontWeight.w600, color: AqarColors.ink900),
                  ),
                ),
                const SizedBox(width: 12),
                Text(formatPriceExact(deal.agreedPrice, currency: deal.currency), style: AqarType.figure(size: 15)),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              '${deal.reference} · ${deal.role == OfferSide.buyer ? tr('بتشتري', 'Buying') : tr('بتبيع', 'Selling')}',
              style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
            ),
            const SizedBox(height: 10),
            // Position, not a percentage: the buyer wants to know which step.
            Row(
              children: [
                Expanded(
                  child: Text(
                    cancelled
                        ? stageLabel(deal.stage)
                        : tr('${stageLabel(deal.stage)} · خطوة $done من $total', '${stageLabel(deal.stage)} · step $done of $total'),
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: cancelled ? AqarColors.danger : AqarColors.ink700,
                      fontFeatures: AqarType.tnum,
                    ),
                  ),
                ),
                if (!cancelled)
                  SizedBox(
                    width: 72,
                    child: LinearProgressIndicator(
                      value: total == 0 ? 0 : done / total,
                      minHeight: 3,
                      backgroundColor: AqarColors.ink100,
                      valueColor: const AlwaysStoppedAnimation(AqarColors.ok700),
                    ),
                  ),
              ],
            ),
            if (hold != null && hold > Duration.zero) ...[
              const SizedBox(height: 6),
              Text(
                '${tr('محجوزة،', 'Reserved,')} ${formatCountdown(hold)}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AqarColors.accent600, fontFeatures: AqarType.tnum),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
