import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'list_unit_screen.dart';
import 'listing_screen_loader.dart';
import 'trade_settings_screen.dart';
import 'trade_request_screens.dart';
import 'tour_screen.dart';

/// My listings — the app's twin of /dashboard/listings, on GET /api/listings/mine.
/// Status, views/saves/requests/offers, expiry, rejection reason and — for drafts — what
/// still blocks publication, with Continue to resume the wizard where it stopped.
class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key});
  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

String listingStatusLabel(String s) => switch (s) {
  'draft' => tr('مسودة', 'Draft'),
  'pending_review' => tr('تحت المراجعة', 'Under review'),
  'live' => tr('منشور', 'Live'),
  'reserved' => tr('محجوز', 'Reserved'),
  'sold' => tr('تم البيع', 'Sold'),
  'paused' => tr('موقوف مؤقتاً', 'Paused'),
  'closed' => tr('مغلق', 'Closed'),
  'rejected' => tr('مرفوض', 'Rejected'),
  'expired' => tr('منتهي', 'Expired'),
  _ => s,
};

class _MyListingsScreenState extends State<MyListingsScreen> {
  List<Map<String, dynamic>> _rows = const [];
  int _active = 0, _cap = 3;
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
      final j = await context.read<Api>().myListings();
      if (!mounted) return;
      setState(() {
        _rows = ((j['listings'] as List?) ?? const []).cast<Map<String, dynamic>>();
        _active = (j['activeCount'] as num?)?.toInt() ?? 0;
        _cap = (j['cap'] as num?)?.toInt() ?? 3;
      });
    } on ApiException {
      if (mounted) setState(() => _error = tr('مش قادرين نحمّل وحداتك.', "We couldn't load your units."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resume(Map<String, dynamic> r) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ListUnitScreen(resumeListingId: r['id'] as String, resumeReference: r['reference'] as String),
    ));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('وحداتي', 'My properties')),
        actions: [
          IconButton(
            tooltip: tr('اعرض وحدة', 'List a unit'),
            icon: const Icon(Icons.add_home_outlined),
            onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ListUnitScreen()));
              if (mounted) _load();
            },
          ),
          const LangToggleButton(),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorNotice(message: _error!, onRetry: _load)
              : _rows.isEmpty
                  ? EmptyState(
                      title: tr('لسه معندكش وحدات', 'No units yet'),
                      body: tr('نشر الإعلان مجاني. بنتحاسب بس لما الوحدة تتباع.', 'Listing is free. We are paid only when the unit sells.'),
                      action: FilledButton(
                        onPressed: () async {
                          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ListUnitScreen()));
                          if (mounted) _load();
                        },
                        child: Text(tr('اعرض وحدتك', 'List your unit')),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                        children: [
                          Text(tr('$_active من $_cap إعلانات نشطة', '$_active of $_cap active listings'),
                              style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
                          const SizedBox(height: 4),
                          for (final (i, r) in _rows.indexed) ...[
                            if (i > 0) const Divider(),
                            _tile(r),
                          ],
                        ],
                      ),
                    ),
    );
  }

  Widget _tile(Map<String, dynamic> r) {
    final status = r['status'] as String? ?? 'draft';
    final title = ((isEn ? r['titleEn'] : r['titleAr']) as String?)?.trim();
    final blocks = ((r['blocks'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final photo = r['photo'] as String?;
    final price = (r['price'] as num?)?.toDouble() ?? 0;
    int n(String k) => (r[k] as num?)?.toInt() ?? 0;
    // Counts in words on one line, instead of four tiny icons nobody could decode.
    final stats = [
      tr('${formatNumber(n('views'))} مشاهدة', '${formatNumber(n('views'))} views'),
      tr('${formatNumber(n('saves'))} حفظ', '${formatNumber(n('saves'))} saves'),
      tr('${formatNumber(n('offers'))} عرض', '${formatNumber(n('offers'))} offers'),
      tr('${formatNumber(n('requests'))} طلب', '${formatNumber(n('requests'))} requests'),
    ].join('  ·  ');
    final compact = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(0, 36)),
      padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 12)),
      textStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
    );
    final tours = n('tourCount');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: 84,
              height: 64,
              child: photo == null
                  ? Container(color: AqarColors.ink100)
                  : CachedNetworkImage(imageUrl: absoluteMediaUrl(photo), fit: BoxFit.cover, errorWidget: (_, __, ___) => Container(color: AqarColors.ink100)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(
                    '${r['reference'] ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
                  ),
                ),
                const SizedBox(width: 8),
                AqarBadge.neutral(listingStatusLabel(status)),
              ]),
              const SizedBox(height: 2),
              Text(title == null || title.isEmpty ? unitTypeLabel(r['type'] as String? ?? '') : title,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: AqarColors.ink900)),
              Text(formatPriceExact(price, currency: r['currency'] as String? ?? 'EGP'),
                  style: AqarType.figure(size: 15)),
              const SizedBox(height: 4),
              Text(stats, style: const TextStyle(fontSize: 12, color: AqarColors.ink500, fontFeatures: AqarType.tnum)),
            ]),
          ),
        ]),
        if (status == 'rejected' && r['rejectReason'] != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('${tr('سبب الرفض', 'Rejected')}: ${r['rejectReason']}', style: const TextStyle(color: AqarColors.danger, fontSize: 12.5, height: 1.5)),
          ),
        if (blocks.isNotEmpty) ...[
          const SizedBox(height: 6),
          for (final b in blocks.take(3))
            Text('• ${(isEn ? b['messageEn'] : b['messageAr']) ?? ''}', style: const TextStyle(fontSize: 12.5, color: AqarColors.danger, height: 1.5)),
        ],
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (status == 'draft' || status == 'rejected')
            FilledButton(style: compact, onPressed: () => _resume(r), child: Text(tr('كمّل', 'Continue'))),
          if (['live', 'reserved', 'sold'].contains(status))
            OutlinedButton(style: compact, onPressed: () => openListingByReference(context, r['reference'] as String), child: Text(tr('اعرض', 'View'))),
          if (!['sold', 'closed'].contains(status))
            OutlinedButton(
              style: compact,
              onPressed: () async {
                await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => TourScreen(listingId: r['id'] as String, reference: r['reference'] as String)));
                if (mounted) _load();
              },
              child: Text(tours > 0
                  ? tr('جولة الفيديو ($tours)', 'Video tour ($tours)')
                  : tr('أضف جولة فيديو', 'Add video tour')),
            ),
          if (!['sold', 'closed', 'reserved'].contains(status))
            OutlinedButton(
              style: compact,
              // Not yet trading: wanting to trade starts with the trade request form ("the
              // unit I want in exchange"), which opens the unit on save, as on the website.
              onPressed: () async {
                if (r['openToTrade'] == true) {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TradeSettingsScreen()));
                } else {
                  await openNewTradeRequest(context, listingId: r['id'] as String);
                }
                // The trade state may have changed; the label below reads it.
                if (mounted) _load();
              },
              // Both states used to read "Open to trade" in English.
              child: Text(r['openToTrade'] == true ? tr('إعدادات المقايضة', 'Trade settings') : tr('افتحها للمقايضة', 'Open to trade')),
            ),
        ]),
      ]),
    );
  }
}
