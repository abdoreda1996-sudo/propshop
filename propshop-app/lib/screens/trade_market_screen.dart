import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/trade.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/listing_card.dart';
import '../widgets/trade_widgets.dart';
import 'listing_screen.dart';
import 'trade_request_screens.dart';

/// The trade market — the app's twin of /trade. Every live, verified unit whose owner
/// opened it to trade, with what they want in return.
class TradeMarketScreen extends StatefulWidget {
  const TradeMarketScreen({super.key});
  @override
  State<TradeMarketScreen> createState() => _TradeMarketScreenState();
}

class _TradeMarketScreenState extends State<TradeMarketScreen> {
  static const _types = ['apartment', 'studio', 'duplex', 'ground_apartment', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'chalet'];
  List<TradeMarketItem> _items = const [];
  String? _type;
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
      final j = await context.read<Api>().tradeMarket(type: _type);
      if (!mounted) return;
      setState(() => _items = ((j['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map(TradeMarketItem.fromJson).toList());
    } on ApiException {
      if (!mounted) return;
      setState(() => _error = tr('مش قادرين نحمّل سوق المقايضة.', "We couldn't load the trade market."));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = tr('مش قادرين نحمّل سوق المقايضة.', "We couldn't load the trade market."));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('سوق المقايضة', 'Trade market')), actions: const [LangToggleButton()]),
      body: Column(
        children: [
          // A lister who wants to trade starts with a trade request: what they want in exchange.
          InkWell(
            onTap: () => openNewTradeRequest(context),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AqarColors.border))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr('عايز تقايض وحدتك؟', 'Want to trade your unit?'),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AqarColors.ink900)),
                const SizedBox(height: 2),
                Text(
                  tr('حدد الوحدة اللي عايزها بنفس فلاتر البحث. هنوريك اللي متاح دلوقتي ونبعتلك إشعار بأي وحدة جديدة تناسبك.',
                      'Describe the unit you want with the search filters. We show what is open now and notify you when a new one fits.'),
                  style: const TextStyle(fontSize: 12.5, height: 1.5, color: AqarColors.textMuted),
                ),
                const SizedBox(height: 6),
                Text(tr('اعمل طلب مقايضة', 'Create a trade request'),
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AqarColors.brand500)),
              ]),
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                _chip(tr('كل الأنواع', 'All types'), _type == null, () => setState(() => _type = null)),
                ..._types.map((t) => _chip(unitTypeLabel(t), _type == t, () => setState(() => _type = t))),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? ErrorNotice(message: _error!, onRetry: _load)
                    : _items.isEmpty
                        ? EmptyState(
                            title: tr('مفيش وحدات متاحة للمقايضة دلوقتي', 'No units open to trade yet'),
                            body: tr('اعمل طلب مقايضة وهنبلغك أول ما وحدة مناسبة تنزل.', 'Create a trade request and we tell you the moment a fitting unit is listed.'),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                              itemCount: _items.length,
                              separatorBuilder: (_, __) => const Padding(
                                padding: EdgeInsets.symmetric(vertical: 16),
                                child: Divider(),
                              ),
                              itemBuilder: (_, i) {
                                final it = _items[i];
                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    ListingCardTile(
                                      listing: it.card,
                                      onTap: () => Navigator.of(context).push(
                                        MaterialPageRoute(builder: (_) => ListingScreen(listing: it.card)),
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(tr('عايز يقايض بـ', 'Would trade for'),
                                        style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500)),
                                    const SizedBox(height: 2),
                                    TradeWantsChips(wants: it.wants, currency: it.card.currency),
                                    if (it.youHaveAMatch)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Text(tr('عندك وحدة بتناسب طلبه', 'You have a unit that fits'),
                                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AqarColors.ok700)),
                                      ),
                                    if (it.isMine)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Text(tr('دي وحدتك', 'This is your unit'), style: const TextStyle(fontSize: 12, color: AqarColors.textMuted)),
                                      ),
                                  ],
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool on, VoidCallback onTap) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 6),
        child: ChoiceChip(
          label: Text(label),
          selected: on,
          onSelected: (_) {
            onTap();
            _load();
          },
        ),
      );
}
