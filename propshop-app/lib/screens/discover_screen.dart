import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/home.dart';
import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/segments.dart';
import '../theme/tokens.dart';
import '../widgets/account_corner.dart';
import '../widgets/brand_logo.dart';
import '../widgets/common.dart';
import '../widgets/discover.dart';
import '../widgets/listing_card.dart';
import 'listing_screen.dart';
import 'trade_market_screen.dart';
import 'list_unit_screen.dart';
import 'open_request_screen.dart';
import 'search_screen.dart';

/// Discover, the app's answer to the website's home page. It reads /api/home, the same
/// server function the website renders from, so the counters cannot disagree.
///
/// Layout (2026-10-26): one column of text and photos separated by whitespace and thin
/// rules. No floating search panel, no tinted plates, no icon circles. The headline and
/// the fee wording follow the website's hero word for word.
class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key, this.onOpenDashboard});

  /// Switches the shell to the Account tab (the account box's "Dashboard").
  final VoidCallback? onOpenDashboard;

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  static const _gutter = 16.0;

  HomeData? _data;
  String? _error;
  bool _loading = false;

  void _push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await context.read<Api>().home();
      if (!mounted) return;
      setState(() => _data = HomeData.fromJson(json));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code);
    } catch (_) {
      // A malformed payload is still "could not load", not a red screen.
      if (!mounted) return;
      setState(() => _error = 'bad_response');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The error message for [_error] (an API error code), resolved at build time so it
  /// follows the current language.
  String _errorMessage(String code) => code == 'network_error'
      ? tr(
          'اتأكد إنك متصل بالإنترنت وجرب تاني.',
          'Check that you are online and try again.',
        )
      : tr(
          'حصل خطأ غير متوقع ($code).',
          'Something unexpected went wrong ($code).',
        );

  void _openSearch({Segment? segment, String? areaSlug, String? compoundSlug, String? title}) {
    _push(SearchScreen(
      initialPurpose: 'sale',
      initialSegment: segment,
      areaSlug: areaSlug,
      compoundSlug: compoundSlug,
      title: title,
    ));
  }

  void _openWeb(String path) =>
      launchUrl(Uri.parse('${Api.defaultBaseUrl}$path'), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) {
    final data = _data;

    if (_error != null && data == null) {
      return Scaffold(
        body: SafeArea(
          child: ErrorNotice(message: _errorMessage(_error!), onRetry: _load),
        ),
      );
    }
    if (data == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              _topBar(),
              _hero(data),
              _fees(data),
              const SizedBox(height: 36),
              _newest(data),
              const SizedBox(height: 20),
              _tradeRow(),
              const SizedBox(height: 36),
              if (data.topCompounds.isNotEmpty) ...[
                _compounds(data),
                const SizedBox(height: 36),
              ],
              if (data.areas.isNotEmpty) ...[
                _areas(data),
                const SizedBox(height: 36),
              ],
              _owners(),
            ],
          ),
        ),
      ),
    );
  }

  // --- Top ------------------------------------------------------------------

  Widget _topBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(_gutter, 8, 8, 0),
      child: Row(
        children: [
          BrandLogo(
            height: 34,
            color: AqarColors.accent500,
            markOnly: MediaQuery.sizeOf(context).width < 400,
          ),
          const Spacer(),
          const LangToggleButton(),
          const SizedBox(width: 4),
          AccountCorner(onOpenDashboard: widget.onOpenDashboard ?? () {}),
        ],
      ),
    );
  }

  Widget _hero(HomeData data) {
    // The newest live listing that has a cover photo, as on the website's home: the only
    // image that can honestly sit under "verified photos of real units". None: text only.
    final heroUnit = data.newest.where((l) => (l.photo ?? '').isNotEmpty).firstOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(_gutter, 20, _gutter, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The headline in two tones, as on the website (owner, 2026-10-24).
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: tr('من المالك مباشرة. ', 'Direct from owner. ')),
                TextSpan(
                  text: tr('من غير سماسرة.', 'No brokers in between.'),
                  style: const TextStyle(color: AqarColors.ink400),
                ),
              ],
            ),
            style: const TextStyle(
              fontSize: 28,
              height: 1.15,
              fontWeight: FontWeight.w700,
              color: AqarColors.ink900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            tr(
              'معروضة من صاحبها نفسه. مستند الملكية والصور والموقع كلها متحققة قبل ما تظهر، وإعلان واحد لكل وحدة.',
              'Listed by the person who owns it. Ownership document, photos and location checked before it appears, and one listing per property.',
            ),
            style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink500),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: () => _openSearch(),
                  child: Text(tr('تصفح الوحدات', 'Browse units')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _push(const OpenRequestScreen()),
                  child: Text(tr('اطلب وحدة', 'Request a unit')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Straight into a market, as the website's tabs.
          Wrap(
            spacing: 4,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(
                  tr('أو ادخل على طول:', 'Or go straight to:'),
                  style: const TextStyle(fontSize: 13, color: AqarColors.ink500),
                ),
              ),
              for (final seg in Segment.values)
                TextButton(
                  onPressed: () => _openSearch(segment: seg),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                  ),
                  child: Text(segmentLabel(seg)),
                ),
            ],
          ),
          if (heroUnit != null) ...[
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () => _push(ListingScreen(listing: heroUnit)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AqarRadius.card),
                child: AspectRatio(
                  aspectRatio: 16 / 10,
                  child: CachedNetworkImage(
                    imageUrl: absoluteMediaUrl(heroUnit.photo!),
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AqarColors.navy50),
                    errorWidget: (_, __, ___) => Container(color: AqarColors.navy50),
                  ),
                ),
              ),
            ),
            // Credit the unit in the picture and link to it, as the website's figcaption.
            Row(
              children: [
                Expanded(
                  child: Text(
                    tr('وحدة معروضة في ${heroUnit.placeAr()}', 'Listed in ${heroUnit.placeEn()}'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AqarColors.ink500),
                  ),
                ),
                TextButton(
                  onPressed: () => _push(ListingScreen(listing: heroUnit)),
                  style: TextButton.styleFrom(
                    foregroundColor: AqarColors.brand500,
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                  child: Text(tr('شوف الإعلان', 'See the listing')),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// "Zero commission", the fee that actually applies, and the numbers behind it. The
  /// disclosure sits in the same block as the claim on purpose: "no commission" printed
  /// alone, above a fee both sides pay, would mislead.
  Widget _fees(HomeData data) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(_gutter, 20, _gutter, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: tr('صفر عمولة. ', 'Zero commission. '),
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AqarColors.ink900),
                ),
                TextSpan(text: tr('لا من المشتري ولا من البائع.', 'Not from the buyer. Not from the seller.')),
              ],
            ),
            style: const TextStyle(fontSize: 16, height: 1.4, color: AqarColors.ink500),
          ),
          const SizedBox(height: 6),
          Text(
            tr(
              'مش نسبة من سعر البيع. كل طرف بيدفع رسم نجاح ثابت واحد حسب نوع الوحدة، معلن قبل ما تبدأ، ومستحق بس لو الصفقة تمت.',
              'Never a percentage of the sale price. Each side pays one fixed success fee, set by unit type, published up front and charged only if a deal completes.',
            ),
            style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.ink500),
          ),
          InkWell(
            onTap: () => _openWeb('/pricing'),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                tr('جدول الرسوم', 'See the fee table'),
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AqarColors.brand500,
                  decoration: TextDecoration.underline,
                  decorationColor: AqarColors.brand100,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 14),
          // The numbers, flush to the reading edge, no boxes.
          Wrap(
            spacing: 24,
            runSpacing: 12,
            children: [
              _Figure(value: data.liveCount, label: tr('وحدة موثقة', 'verified units')),
              _Figure(value: data.compoundCount, label: tr('كمبوند', 'compounds')),
              _Figure(value: data.closedCount, label: tr('صفقة مكتملة', 'deals closed')),
              _Figure(value: 0, label: tr('جنيه عمولة', 'EGP commission'), accent: true),
            ],
          ),
        ],
      ),
    );
  }

  // --- Sections -------------------------------------------------------------

  Widget _newest(HomeData data) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: _gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHead(
            title: tr('آخر الوحدات', 'Just listed'),
            count: tr(
              'من ${formatNumber(data.liveCount)} وحدة متاحة',
              'Out of ${formatNumber(data.liveCount)} available',
            ),
            moreLabel: tr('الكل', 'See all'),
            onMore: _openSearch,
          ),
          const SizedBox(height: 12),
          for (final listing in data.newest.take(4))
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: ListingCardTile(
                listing: listing,
                onTap: () => _push(ListingScreen(listing: listing)),
              ),
            ),
        ],
      ),
    );
  }

  /// The trade market, one plain row between rules.
  Widget _tradeRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: _gutter),
      child: Container(
        decoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: AqarColors.border),
            bottom: BorderSide(color: AqarColors.border),
          ),
        ),
        child: PlainRow(
          divider: false,
          label: tr('سوق المقايضة', 'Trade market'),
          detail: tr(
            'بدّل وحدتك بوحدة تانية مع صاحبها، ولو في فرق سعر يتدفع كاش.',
            'Swap your unit for another, owner to owner. Any price gap is settled in cash.',
          ),
          onTap: () => _push(const TradeMarketScreen()),
        ),
      ),
    );
  }

  Widget _compounds(HomeData data) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: _gutter),
          child: SectionHead(
            title: tr('الكمبوندات', 'Compounds'),
            count: tr(
              'الأكتر وحدات الأول',
              'Most units first',
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 196,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: _gutter),
            itemCount: data.topCompounds.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final c = data.topCompounds[i];
              return CompoundTile(
                compound: c,
                onTap: () => _openSearch(compoundSlug: c.slug, title: c.name),
              );
            },
          ),
        ),
      ],
    );
  }

  /// Areas as a plain two-column index: name and count. Faster to scan than a carousel
  /// of round photos, and every name fits.
  Widget _areas(HomeData data) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: _gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHead(title: tr('المناطق', 'Areas')),
          const SizedBox(height: 4),
          LayoutBuilder(
            builder: (context, c) {
              final w = (c.maxWidth - 24) / 2;
              return Wrap(
                spacing: 24,
                children: [
                  for (final a in data.areas)
                    SizedBox(
                      width: w,
                      child: AreaRow(
                        area: a,
                        onTap: () => _openSearch(areaSlug: a.slug, title: a.name),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _owners() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: _gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(),
          const SizedBox(height: 24),
          Text(
            tr('عندك وحدة عايز تبيعها؟', 'Selling a unit?'),
            style: const TextStyle(fontSize: 20, height: 1.25, fontWeight: FontWeight.w700, color: AqarColors.ink900),
          ),
          const SizedBox(height: 8),
          Text(
            tr(
              'وثّق بطاقتك ومستند الملكية، وصوّر الوحدة من التطبيق وإنت جواها. نشر الإعلان مجاني، والرسم بيتدفع بس لما تتباع.',
              'Verify your ID and the ownership document, then photograph the unit from inside it with the app. Listing is free; the fee is due only when it sells.',
            ),
            style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink500),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => _push(const ListUnitScreen()),
            child: Text(tr('اعرض وحدتك', 'List your unit')),
          ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.value, required this.label, this.accent = false});
  final int value;
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          formatNumber(value),
          style: AqarType.figure(size: 20, color: accent ? AqarColors.accent500 : AqarColors.ink900),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11.5, color: AqarColors.ink500)),
      ],
    );
  }
}
