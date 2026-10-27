import '../services/viewing_slots.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../models/trade.dart';
import '../widgets/trade_widgets.dart';
import 'package:provider/provider.dart';

import '../models/listing.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import '../widgets/make_offer_sheet.dart';
import '../widgets/price_history_chart.dart';
import '../models/tour.dart';
import '../widgets/tour_widgets.dart';
import 'login_screen.dart';

/// The listing page: the three prices, the verification provenance, and a request
/// action that never exposes a phone number.
class ListingScreen extends StatefulWidget {
  const ListingScreen({super.key, required this.listing});
  final ListingCard listing;

  @override
  State<ListingScreen> createState() => _ListingScreenState();
}

class _ListingScreenState extends State<ListingScreen> {
  List<PricePoint> _history = const [];
  // Trade block from the detail endpoint; null until loaded / when not open to trade.
  TradeWants? _tradeWants;
  // Approved virtual tours, from the detail endpoint.
  List<Tour> _tours = const [];
  // Every photo at full size, cover first, and the owner's description: both only on
  // the detail endpoint. The page never showed the description before.
  List<String> _media = const [];
  String _descAr = '', _descEn = '';

  /// The owner's description in the current language, Arabic when there is no English.
  String get _description => isEn && _descEn.isNotEmpty ? _descEn : _descAr;
  final _tourKey = GlobalKey();

  ListingCard get listing => widget.listing;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  /// Price history lives on the detail endpoint, not the search card payload.
  Future<void> _loadDetail() async {
    try {
      final json = await context.read<Api>().listingDetail(listing.reference);
      final raw = (json['priceHistory'] as List? ?? [])
          .cast<Map<String, dynamic>>();
      final trade = json['trade'] as Map<String, dynamic>?;
      final tours = ((json['tours'] as List?) ?? const []).cast<Map<String, dynamic>>();
      final media = ((json['media'] as List?) ?? const []).cast<Map<String, dynamic>>();
      // Cover first, then capture order. Only URLs an image widget can load.
      media.sort((a, b) => (b['isCover'] == true ? 1 : 0) - (a['isCover'] == true ? 1 : 0));
      final urls = [
        for (final m in media)
          if ((m['url'] as String? ?? '').startsWith(RegExp(r'https?://|/'))) m['url'] as String,
      ];
      if (!mounted) return;
      setState(() {
        _media = urls;
        _descAr = (json['descriptionAr'] as String? ?? '').trim();
        _descEn = (json['descriptionEn'] as String? ?? '').trim();
        _history = raw.map(PricePoint.fromJson).toList();
        _tours = tours.map(Tour.fromJson).toList();
        _tradeWants = (trade?['open'] == true && trade?['wants'] is Map<String, dynamic>)
            ? TradeWants.fromJson(trade!['wants'] as Map<String, dynamic>)
            : null;
      });
    } on ApiException {
      // The rest of the page is already usable from the card payload.
    } on TypeError {
      // A malformed field in the detail payload must not blank the page either.
    }
  }

  @override
  Widget build(BuildContext context) {
    // The detail payload carries every photo at full size; until it arrives (or if it
    // fails) the card's thumbnails stand in.
    final photos = _media.isNotEmpty
        ? _media
        : listing.photos.isNotEmpty
            ? listing.photos
            : [if (listing.photo != null) listing.photo!];
    return Scaffold(
      appBar: AppBar(
        title: Text(listing.reference, style: const TextStyle(fontFeatures: AqarType.tnum)),
        actions: const [LangToggleButton()],
      ),
      bottomNavigationBar: _RequestBar(listing: listing, tradeOpen: _tradeWants != null),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          if (photos.isNotEmpty)
            AspectRatio(
              aspectRatio: 4 / 3,
              child: Stack(fit: StackFit.expand, children: [
                // Every photo, swipeable, with a plain "3 / 12" counter. The page used
                // to show the cover alone, so the other photos were only on the website.
                _Gallery(photos: photos),
                if (_tours.isNotEmpty)
                  PositionedDirectional(
                    bottom: 12,
                    start: 12,
                    child: Material(
                      color: AqarColors.ink900.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(6),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(6),
                        onTap: () {
                          final ctx = _tourKey.currentContext;
                          if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 400));
                        },
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(10, 7, 12, 7),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.play_arrow, size: 16, color: Colors.white),
                              const SizedBox(width: 4),
                              Text(
                                tr('الجولة بالفيديو', 'Video tour'),
                                style: const TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ]),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    AqarBadge.verified(_trustLabel(listing.trustLevel)),
                    PriceVerdictBadge(verdict: listing.verdict),
                    if (listing.withoutOver) AqarBadge.neutral(tr('بدون أوفر', 'Without over')),
                    if (_tradeWants != null) const TradeBadge(),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  formatPriceExact(listing.price, currency: listing.currency),
                  style: AqarType.figure(size: 26, weight: FontWeight.w700),
                ),
                if (listing.sizeSqm > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '${formatPriceExact(listing.price / listing.sizeSqm, currency: listing.currency)} ${tr('للمتر', 'per m²')}',
                      style: const TextStyle(fontSize: 13, color: AqarColors.ink500, fontFeatures: AqarType.tnum),
                    ),
                  ),
                const SizedBox(height: 12),
                Text(
                  listing.title.isNotEmpty ? listing.title : listing.place(),
                  style: const TextStyle(
                    fontSize: 18,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                    color: AqarColors.ink900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _placeLine(listing),
                  style: const TextStyle(fontSize: 14, color: AqarColors.ink500),
                ),

                const SizedBox(height: 20),
                _SpecGrid(listing: listing),

                if (_description.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  SectionTitle(tr('من المالك', 'From the owner')),
                  Text(
                    _description,
                    style: const TextStyle(fontSize: 14, height: 1.65, color: AqarColors.ink700),
                  ),
                ],

                const SizedBox(height: 28),
                _FairPricePanel(listing: listing),

                if (_tours.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  KeyedSubtree(key: _tourKey, child: TourSection(tours: _tours, fallbackPoster: listing.photo)),
                ],

                if (_history.length > 1) ...[
                  const SizedBox(height: 28),
                  SectionTitle(tr('تاريخ السعر', 'Price history')),
                  PriceHistoryChart(
                    points: _history,
                    currency: listing.currency,
                  ),
                ],

                const SizedBox(height: 28),
                SectionTitle(tr('اتحققنا من إيه', 'What we checked')),
                ...[
                  tr(
                    'بطاقة الرقم القومي، ومطابقة لاسم المالك',
                    "The owner's national ID, matching the name on the deed",
                  ),
                  tr(
                    'مستند الملكية، ومطابق لبيانات الوحدة',
                    'The ownership document, matching the unit details',
                  ),
                  if (listing.trustLevel >= 3)
                    tr(
                      'الصور متصورة من التطبيق، ومعاها الموقع والوقت',
                      'Photos taken in the app, with location and time',
                    )
                  else
                    tr('الصور، اتراجعت يدوي', 'Photos, reviewed by hand'),
                  tr(
                    'الموقع جوه حدود الكمبوند، والمساحة في النطاق المعروف',
                    "Location inside the compound, size within its known range",
                  ),
                  tr(
                    'إعلان واحد بس للوحدة دي على الموقع',
                    'Only one listing for this unit on the site',
                  ),
                ].map(
                  (line) => Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: AqarColors.border)),
                    ),
                    child: Text(
                      line,
                      style: const TextStyle(fontSize: 14, height: 1.5, color: AqarColors.ink900),
                    ),
                  ),
                ),

                if (_tradeWants != null) ...[
                  const SizedBox(height: 28),
                  SectionTitle(tr('المالك عايز يقايض بـ', 'The owner would trade for')),
                  TradeWantsChips(wants: _tradeWants!, currency: listing.currency),
                ],
                const SizedBox(height: 24),
                const ContactPolicyNote(),
                const SizedBox(height: 8),
                _ReportButton(listing: listing),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _trustLabel(int level) {
    switch (level) {
      case 4:
        return tr('معاينة ميدانية', 'Site-inspected');
      case 3:
        return tr('صور موثقة', 'Verified photos');
      default:
        return tr('ملكية موثقة', 'Verified ownership');
    }
  }

  /// "Compound · Area" in the current language, English falling back to Arabic.
  static String _placeLine(ListingCard l) {
    final compound = isEn && (l.compoundEn ?? '').isNotEmpty
        ? l.compoundEn
        : l.compoundAr;
    final area = isEn && l.areaEn.isNotEmpty ? l.areaEn : l.areaAr;
    return compound != null ? '$compound · $area' : area;
  }
}

/// The listing's photos as a swipeable strip with a "3 / 12" counter. A mouse can drag it
/// too: on the web build a PageView ignores mouse drags by default.
class _Gallery extends StatefulWidget {
  const _Gallery({required this.photos});
  final List<String> photos;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    return Stack(
      fit: StackFit.expand,
      children: [
        ScrollConfiguration(
          behavior: ScrollConfiguration.of(context).copyWith(
            dragDevices: {PointerDeviceKind.touch, PointerDeviceKind.mouse, PointerDeviceKind.trackpad},
          ),
          child: PageView.builder(
            itemCount: photos.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (_, i) => CachedNetworkImage(
              imageUrl: absoluteMediaUrl(photos[i]),
              fit: BoxFit.cover,
              placeholder: (_, __) => Container(color: AqarColors.ink100),
              errorWidget: (_, __, ___) => Container(
                color: AqarColors.ink100,
                alignment: Alignment.center,
                child: const Icon(Icons.image_not_supported_outlined, size: 22, color: AqarColors.ink400),
              ),
            ),
          ),
        ),
        if (photos.length > 1)
          PositionedDirectional(
            bottom: 12,
            end: 12,
            child: IgnorePointer(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AqarColors.ink900.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '${formatNumber(_index + 1)} / ${formatNumber(photos.length)}',
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600, fontFeatures: AqarType.tnum),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The asking price against the estimate: plain rows under a section title.
class _FairPricePanel extends StatelessWidget {
  const _FairPricePanel({required this.listing});
  final ListingCard listing;

  @override
  Widget build(BuildContext context) {
    final hasEstimate = listing.fairLow != null && listing.fairHigh != null && (listing.fairMid ?? 0) > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(tr('السعر مقارنة بالسوق', 'Price against the market')),
        _row(
          tr('السعر المطلوب', 'Asking price'),
          formatPriceExact(listing.price, currency: listing.currency),
          strong: true,
        ),
        const SizedBox(height: 8),
        if (hasEstimate) ...[
          _row(
            tr('السعر العادل التقديري', 'Estimated fair price'),
            '${formatPriceExact(listing.fairLow!, currency: listing.currency)} – ${formatPriceExact(listing.fairHigh!, currency: listing.currency)}',
            color: AqarColors.ok700,
          ),
          const SizedBox(height: 12),
          FairPriceBand(
            asking: listing.price,
            low: listing.fairLow!,
            high: listing.fairHigh!,
          ),
          const SizedBox(height: 6),
          Text(
            tr(
              'درجة الثقة: ${_confidence(listing.fairConfidence)}',
              'Confidence: ${_confidence(listing.fairConfidence)}',
            ),
            style: const TextStyle(fontSize: 11.5, color: AqarColors.ink500),
          ),
        ] else
          _row(
            tr('السعر العادل التقديري', 'Estimated fair price'),
            tr('مفيش بيانات كفاية لتقدير', 'Not enough data for an estimate'),
            color: AqarColors.ink500,
          ),
        const SizedBox(height: 10),
        Text(
          tr(
            'تقدير استرشادي من أسعار السوق، مش تقييم عقاري معتمد، وماينفعش للتمويل أو القضايا.',
            'A rough estimate from market prices. Not a certified valuation, and not for financing or legal use.',
          ),
          style: const TextStyle(fontSize: 11.5, height: 1.6, color: AqarColors.ink500),
        ),
      ],
    );
  }

  static String _confidence(String? c) {
    switch (c) {
      case 'high':
        return tr('عالية', 'high');
      case 'medium':
        return tr('متوسطة', 'medium');
      default:
        return tr('منخفضة', 'low');
    }
  }

  Widget _row(String label, String value, {bool strong = false, Color? color}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 13.5, color: AqarColors.ink500),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          flex: 2,
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: AqarType.figure(size: strong ? 16 : 14, weight: FontWeight.w600, color: color ?? AqarColors.ink900),
          ),
        ),
      ],
    );
  }
}

/// The unit's facts as a two-column list with hairlines, not six boxed tiles.
class _SpecGrid extends StatelessWidget {
  const _SpecGrid({required this.listing});
  final ListingCard listing;

  @override
  Widget build(BuildContext context) {
    final specs = <(String, String)>[
      (tr('النوع', 'Type'), unitTypeLabel(listing.type)),
      (tr('المساحة', 'Size'), '${formatNumber(listing.sizeSqm.round())} ${tr('م²', 'm²')}'),
      if (listing.bedrooms > 0) (tr('غرف النوم', 'Bedrooms'), formatNumber(listing.bedrooms)),
      (tr('الحمامات', 'Bathrooms'), formatNumber(listing.bathrooms)),
      (tr('التشطيب', 'Finishing'), finishingLabel(listing.finishing)),
      (
        tr('الاستلام', 'Delivery'),
        listing.deliveryStatus == 'ready' ? tr('استلام فوري', 'Ready to move') : tr('تحت الإنشاء', 'Under construction'),
      ),
    ];

    Widget cell((String, String) s) => Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: AqarColors.border))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.$1, style: const TextStyle(fontSize: 12, color: AqarColors.ink500)),
              const SizedBox(height: 2),
              Text(
                s.$2,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AqarColors.ink900, fontFeatures: AqarType.tnum),
              ),
            ],
          ),
        );

    return Column(
      children: [
        for (var i = 0; i < specs.length; i += 2)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: cell(specs[i])),
              const SizedBox(width: 16),
              Expanded(child: i + 1 < specs.length ? cell(specs[i + 1]) : const SizedBox.shrink()),
            ],
          ),
      ],
    );
  }
}

class _RequestBar extends StatefulWidget {
  const _RequestBar({required this.listing, this.tradeOpen = false});
  final ListingCard listing;

  /// The owner opened this unit to trade (from the detail payload).
  final bool tradeOpen;

  @override
  State<_RequestBar> createState() => _RequestBarState();
}

class _RequestBarState extends State<_RequestBar> {
  bool _busy = false;

  /// Every action here needs an account, so sign-in is handled once rather than being
  /// repeated inside each one. Returns false when the user backed out.
  Future<bool> _ensureSignedIn() async {
    final session = context.read<SessionController>();
    if (session.isSignedIn) return true;
    final signedIn = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const LoginScreen()));
    return signedIn == true;
  }

  bool get _acceptsOffers => widget.listing.status == 'live';

  Future<void> _makeOffer() async {
    if (!await _ensureSignedIn() || !mounted) return;
    final sent = await showMakeOfferSheet(
      context,
      listingId: widget.listing.id,
      price: widget.listing.price,
      currency: widget.listing.currency,
    );
    if (sent == true && mounted) context.read<SessionController>().refresh();
  }

  Future<void> _offerTrade() async {
    if (!await _ensureSignedIn() || !mounted) return;
    final sent = await showTradeOfferSheet(context, targetListingId: widget.listing.id);
    if (sent == true && mounted) context.read<SessionController>().refresh();
  }

  Future<void> _requestViewing() async {
    if (!await _ensureSignedIn() || !mounted) return;
    final slots = await showModalBottomSheet<List<SlotPick>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ViewingSheet(),
    );
    if (slots == null || slots.isEmpty || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.read<Api>().requestViewing(widget.listing.id, slots);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(
              'طلب المعاينة وصل. المالك هيأكد ميعاد أو يقترح غيره.',
              'Viewing request sent. The owner will confirm a time or suggest another.',
            ),
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      final msg =
          (e.body?[isEn ? 'messageEn' : 'messageAr'] as String?) ??
          tr('مش قادرين نبعت الطلب.', "We couldn't send the request.");
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // One obvious primary action (Section 28.1); the other two stay visually quieter.
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AqarColors.border)),
      ),
      child: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: (_busy || !_acceptsOffers) ? null : _makeOffer,
                child: Text(
                  !_acceptsOffers
                      ? tr('الوحدة محجوزة', 'Unit reserved')
                      : _busy
                      ? tr('جاري…', 'Working…')
                      : tr('قدّم عرضك', 'Make an offer'),
                ),
              ),
            ),
            const SizedBox(height: 8),
            // "Ask the owner" was removed here (owner, 2026-10-02), matching the website
            // (2026-09-22): the two actions left — an offer and a viewing — are the ones that
            // move a sale forward. Existing threads stay readable under Messages.
            // The secondary actions share one row, so the bar is two rows tall rather
            // than three — on a phone three full-width buttons covered a fifth of the screen.
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    // A reserved or sold unit cannot be viewed either (ListingCard.status).
                    onPressed: (_busy || !_acceptsOffers) ? null : _requestViewing,
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: 8)),
                    child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('اطلب معاينة', 'Request a viewing'))),
                  ),
                ),
                if (widget.tradeOpen && _acceptsOffers) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _offerTrade,
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44), padding: const EdgeInsets.symmetric(horizontal: 8)),
                      child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('اعرض مقايضة', 'Offer a trade'))),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
      ),
    );
  }
}

/// The next seven days x the three daily windows (11-2, 2-6, 6-9), one row per day.
/// Buttons rather than a calendar: picking is one tap.
class _ViewingSheet extends StatefulWidget {
  const _ViewingSheet();

  @override
  State<_ViewingSheet> createState() => _ViewingSheetState();
}

class _ViewingSheetState extends State<_ViewingSheet> {
  final List<SlotPick> _picked = [];

  List<DateTime> get _days {
    final now = DateTime.now();
    return [
      for (var day = 1; day <= 7; day++)
        DateTime(now.year, now.month, now.day + day),
    ];
  }

  void _toggle(SlotPick pick) => setState(() {
    if (_picked.contains(pick)) {
      _picked.remove(pick);
    } else if (_picked.length < 3) {
      _picked.add(pick);
    }
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr('اطلب معاينة', 'Request a viewing'),
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              tr(
                'اختار لحد 3 مواعيد تناسبك، والمالك يأكد واحد منهم.',
                'Pick up to 3 times that suit you; the owner confirms one.',
              ),
              style: const TextStyle(fontSize: 13, color: AqarColors.textMuted),
            ),
            const SizedBox(height: 14),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final d in _days) ...[
                      Text(
                        dayLabel(d),
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AqarColors.ink700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          for (final w in viewingWindows) ...[
                            Expanded(
                              child: FilterChip(
                                label: SizedBox(
                                  width: double.infinity,
                                  child: Text(
                                    w.label,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 11.5),
                                  ),
                                ),
                                selected: _picked.contains(
                                  SlotPick(ymd(d), w.key),
                                ),
                                showCheckmark: false,
                                onSelected: (_) =>
                                    _toggle(SlotPick(ymd(d), w.key)),
                              ),
                            ),
                            if (w != viewingWindows.last)
                              const SizedBox(width: 6),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _picked.isEmpty
                    ? null
                    : () => Navigator.of(context).pop(_picked),
                child: Text(tr('ابعت الطلب', 'Send request')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportButton extends StatelessWidget {
  const _ReportButton({required this.listing});
  final ListingCard listing;

  /// The same six reasons as the website's ReportListingButton. This used to send
  /// "contacted_by_broker" for every report, so fake photos, duplicates and wrong prices
  /// could not be reported from the app at all.
  static List<(String, String)> get _reasons => [
    ('contacted_by_broker', tr('اتصل بيا سمسار', 'A broker contacted me')),
    ('fake_photos', tr('الصور مش حقيقية', 'The photos are fake')),
    ('duplicate', tr('إعلان مكرر', 'Duplicate listing')),
    ('wrong_price', tr('السعر غلط', 'Wrong price')),
    ('unreachable', tr('المالك مش بيرد', 'The owner does not respond')),
    ('other', tr('حاجة تانية', 'Something else')),
  ];

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () async {
        final session = context.read<SessionController>();
        if (!session.isSignedIn) {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
          return;
        }
        final api = context.read<Api>();
        final messenger = ScaffoldMessenger.of(context);
        final picked = await showModalBottomSheet<(String, String)>(
          context: context,
          isScrollControlled: true,
          builder: (_) => const _ReportSheet(),
        );
        if (picked == null) return;
        try {
          await api.report(listing.id, picked.$1, detail: picked.$2.isEmpty ? null : picked.$2);
          messenger.showSnackBar(SnackBar(content: Text(tr('وصلنا بلاغك. فريق الجودة هيراجعه.', 'We received your report. The quality team will review it.'))));
        } on ApiException {
          messenger.showSnackBar(SnackBar(content: Text(tr('مش قادرين نبعت البلاغ دلوقتي.', "We couldn't send the report right now."))));
        }
      },
      style: TextButton.styleFrom(foregroundColor: AqarColors.ink500, padding: EdgeInsets.zero),
      child: Text(tr('بلّغ عن الإعلان', 'Report this listing')),
    );
  }
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet();
  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  String? _reason;
  final _detail = TextEditingController();

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 18, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('بلّغ عن الإعلان', 'Report this listing'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final (k, label) in _ReportButton._reasons)
                  ChoiceChip(label: Text(label), selected: _reason == k, onSelected: (_) => setState(() => _reason = k)),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _detail,
              maxLines: 3,
              maxLength: 500,
              decoration: InputDecoration(hintText: tr('تفاصيل (اختياري)', 'Details (optional)')),
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _reason == null ? null : () => Navigator.of(context).pop((_reason!, _detail.text.trim())),
                child: Text(tr('ابعت البلاغ', 'Send report')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
