import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter/services.dart';

import '../models/trade.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'listing_screen_loader.dart';
import 'trade_market_screen.dart';
import 'trade_request_screens.dart';
import 'trade_settings_screen.dart';

/// Trades, the app's twin of /dashboard/trades. Four tabs: offers (both directions,
/// whatever needs my reply first), my trade requests ("the unit I want in exchange"),
/// matches ("your unit fits"), and my units open to trade.
class TradesScreen extends StatefulWidget {
  const TradesScreen({super.key});
  @override
  State<TradesScreen> createState() => _TradesScreenState();
}

/// An empty or error state inside a pull-to-refresh tab: the list needs a scrollable
/// child, and EmptyState needs a bounded height.
Widget scrollableEmpty(Widget child) => LayoutBuilder(
      builder: (context, c) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [SizedBox(height: c.maxHeight, child: child)],
      ),
    );

class _TradesScreenState extends State<TradesScreen> {
  List<TradeOffer> _offers = const [];
  List<TradeMatch> _matches = const [];
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
      final api = context.read<Api>();
      final r = await Future.wait([api.tradeOffers(), api.tradeMatches()]);
      if (!mounted) return;
      setState(() {
        _offers = ((r[0]['offers'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeOffer.fromJson).toList();
        _matches = ((r[1]['matches'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeMatch.fromJson).toList();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code == 'unauthorized'
          ? tr('سجّل دخولك عشان تشوف مقايضاتك.', 'Sign in to see your trades.')
          : e.code == 'network_error'
              ? tradeErrorText(e.code)
              : tr('مش قادرين نحمّل المقايضات.', "We couldn't load your trades."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _respond(TradeOffer o, String action) async {
    if (action == 'accept') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(tr('تقبل المقايضة؟', 'Accept this trade?')),
          content: Text(tr(
            'القبول بيحجز كل الوحدات اللي في العرض، وبيقفل أي عروض تانية عليها، وكل طرف هيشوف اسم ورقم التاني.',
            "Accepting reserves every unit in the offer, closes other offers on them, and shows each side the other's name and number.",
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('رجوع', 'Back'))),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('اقبل', 'Accept'))),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    try {
      await context.read<Api>().respondToTradeOffer(o.id, action);
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tradeErrorText(e.code))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final needsMe = _offers.where((o) => o.needsMyReply).toList();
    final accepted = _offers.where((o) => o.status == 'accepted').toList();
    final sent = _offers.where((o) => o.live && o.iProposed).toList();
    final past = _offers.where((o) => !o.live && o.status != 'accepted').toList();

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('المقايضة', 'Trades')),
          actions: [
            IconButton(
              tooltip: tr('سوق المقايضة', 'Trade market'),
              icon: const Icon(Icons.storefront_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TradeMarketScreen())),
            ),
            const LangToggleButton(),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AqarColors.ink900,
            unselectedLabelColor: AqarColors.ink500,
            indicatorColor: AqarColors.accent500,
            labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            unselectedLabelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            tabs: [
              Tab(text: needsMe.isEmpty ? tr('العروض', 'Offers') : '${tr('العروض', 'Offers')} (${formatNumber(needsMe.length)})'),
              Tab(text: tr('طلبات المقايضة', 'Trade requests')),
              Tab(text: tr('بتناسبك', 'Matches')),
              Tab(text: tr('وحداتي', 'My units')),
            ],
          ),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ErrorNotice(message: _error!, onRetry: _load)
                : TabBarView(children: [
                    RefreshIndicator(
                      onRefresh: _load,
                      child: _offers.isEmpty
                          ? scrollableEmpty(
                              EmptyState(
                                title: tr('لسه مفيش مقايضات', 'No trades yet'),
                                body: tr('بدّل وحدتك بوحدة تانية مع صاحبها مباشرة.', 'Swap your unit for another, owner to owner.'),
                                action: Wrap(spacing: 8, runSpacing: 8, children: [
                                  FilledButton(
                                    onPressed: () => openNewTradeRequest(context),
                                    child: Text(tr('عايز أقايض وحدتي', 'Trade my unit')),
                                  ),
                                  OutlinedButton(
                                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TradeMarketScreen())),
                                    child: Text(tr('سوق المقايضة', 'Trade market')),
                                  ),
                                ]),
                              ),
                            )
                          : ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
                              ..._section(tr('مستنية ردك', 'Needs your reply'), needsMe),
                              ..._section(tr('اتقبلت', 'Accepted'), accepted),
                              ..._section(tr('عروض إنت بعتها', 'Offers you sent'), sent),
                              ..._section(tr('قديمة', 'Past'), past),
                            ]),
                    ),
                    const MyTradeRequestsView(),
                    RefreshIndicator(
                      onRefresh: _load,
                      child: _matches.isEmpty
                          ? scrollableEmpty(
                              EmptyState(
                                title: tr('مفيش وحدات بتناسبك دلوقتي', 'No matches right now'),
                                body: tr('لما وحدة من وحداتك تناسب طلب مقايضة حد، هتظهر هنا.', "When one of your units fits someone's trade request, it shows here."),
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                              itemCount: _matches.length,
                              itemBuilder: (_, i) => _MatchTile(m: _matches[i]),
                            ),
                    ),
                    const TradeSettingsScreen(embedded: true),
                  ]),
      ),
    );
  }

  List<Widget> _section(String title, List<TradeOffer> rows) {
    if (rows.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 2),
        child: Text.rich(
          TextSpan(children: [
            TextSpan(text: title),
            TextSpan(
              text: '  ${formatNumber(rows.length)}',
              style: const TextStyle(fontWeight: FontWeight.w500, color: AqarColors.ink400),
            ),
          ]),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
        ),
      ),
      ...rows.map((o) => _TradeCard(o: o, onRespond: (a) => _respond(o, a))),
    ];
  }
}

/// One offer as a block of plain lines under a hairline: reference and status, what is
/// given, what is taken, the cash, then the actions.
class _TradeCard extends StatelessWidget {
  const _TradeCard({required this.o, required this.onRespond});
  final TradeOffer o;
  final void Function(String action) onRespond;

  @override
  Widget build(BuildContext context) {
    Widget side(String label, List<TradeUnit> units) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 78,
                child: Text(label, style: const TextStyle(fontSize: 12.5, height: 1.5, color: AqarColors.ink500)),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final u in units)
                      InkWell(
                        onTap: () => openListingByReference(context, u.reference),
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(text: u.title),
                            TextSpan(
                              text: '  ${formatPrice(u.price, currency: u.currency)}',
                              style: const TextStyle(fontWeight: FontWeight.w500, color: AqarColors.ink500),
                            ),
                          ]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13.5,
                            height: 1.5,
                            fontWeight: FontWeight.w600,
                            color: AqarColors.ink900,
                            fontFeatures: AqarType.tnum,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );

    final cash = o.cashAmount > 0
        ? (o.iPayCash
            ? tr('هتدفع ${formatPriceExact(o.cashAmount)} فرق', 'You pay ${formatPriceExact(o.cashAmount)} on top')
            : tr('هتاخد ${formatPriceExact(o.cashAmount)} فرق', 'You receive ${formatPriceExact(o.cashAmount)} on top'))
        : tr('من غير فلوس', 'No cash');

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(o.reference, style: const TextStyle(fontWeight: FontWeight.w700, fontFeatures: AqarType.tnum)),
                AqarBadge.neutral(tradeStatusLabel(o.status)),
                if (o.status == 'accepted' && o.stage != null) AqarBadge.neutral(tradeStageLabel(o.stage!)),
              ]),
            ),
            if (o.live)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('${tr('لحد', 'until')} ${formatDate(o.expiresAt)}', style: const TextStyle(fontSize: 11.5, color: AqarColors.textMuted)),
              ),
          ]),
          side(o.iProposed ? tr('بتدي', 'You give') : tr('بياخد منك', 'They want'), o.iProposed ? o.units : [o.target]),
          side(o.iProposed ? tr('بتاخد', 'You get') : tr('بيديك', 'They give'), o.iProposed ? [o.target] : o.units),
          Padding(
            padding: const EdgeInsetsDirectional.only(top: 6, start: 78),
            child: Text(cash, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ink700, fontFeatures: AqarType.tnum)),
          ),
          if (o.status == 'accepted' && o.counterpartyPhone != null)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsetsDirectional.only(start: 12),
              decoration: const BoxDecoration(
                border: BorderDirectional(start: BorderSide(color: AqarColors.ok700, width: 2)),
              ),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(o.counterpartyName ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(tr('فريق بروب شوب هيتابع معاكم الأوراق.', 'The PropShop team will follow up on the paperwork.'),
                        style: const TextStyle(fontSize: 12, color: AqarColors.textMuted)),
                    if (o.myFee != null)
                      Text(
                        '${tr('رسم النجاح عليك', 'Your success fee')}: ${formatPriceExact(o.myFee!)}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
                      ),
                  ]),
                ),
                TextButton.icon(
                  // Copy rather than dial: no url_launcher dependency, and the number
                  // usually goes into WhatsApp anyway.
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: o.counterpartyPhone!));
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(tr('الرقم اتنسخ', 'Number copied'))),
                    );
                  },
                  icon: const Icon(Icons.copy, size: 16),
                  label: Text(o.counterpartyPhone!, textDirection: TextDirection.ltr),
                ),
              ]),
            ),
          if (o.status == 'cancelled' && o.cancelReason != null)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text(o.cancelReason!, style: const TextStyle(fontSize: 12, color: AqarColors.textMuted))),
          if (o.live) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (o.iProposed)
                OutlinedButton(onPressed: () => onRespond('withdraw'), child: Text(tr('اسحب العرض', 'Withdraw')))
              else ...[
                FilledButton(onPressed: () => onRespond('accept'), child: Text(tr('اقبل', 'Accept'))),
                OutlinedButton(onPressed: () => onRespond('reject'), child: Text(tr('ارفض', 'Decline'))),
              ],
            ]),
          ],
        ],
      ),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.m});
  final TradeMatch m;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => openListingByReference(context, m.listing.reference),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m.listing.title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
          const SizedBox(height: 2),
          Text('${m.listing.reference} · ${formatPriceExact(m.listing.price, currency: m.listing.currency)}',
              style: const TextStyle(fontSize: 12.5, color: AqarColors.textMuted, fontFeatures: AqarType.tnum)),
          const SizedBox(height: 6),
          Text(
            m.perfect
                ? tr('وحدتك ${m.myUnitReference} بتناسب طلبه، ووحدته بتناسب طلبك', 'Your ${m.myUnitReference} fits what they want, and theirs fits yours')
                : tr('وحدتك ${m.myUnitReference} بتناسب طلب المالك', 'Your ${m.myUnitReference} fits what the owner wants'),
            style: const TextStyle(fontSize: 12.5, color: AqarColors.ok700, fontWeight: FontWeight.w600),
          ),
        ]),
      ),
    );
  }
}
