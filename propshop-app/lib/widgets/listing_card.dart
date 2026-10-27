import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import '../services/api.dart';

import '../models/listing.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';
import 'common.dart';
import 'save_heart.dart';

/// "6 days ago", with correct Arabic plurals. Mirrors relativeDays() in the web card.
String relativeDays(int days, {bool? ar}) {
  if (!(ar ?? !isEn)) {
    if (days <= 0) return 'today';
    return days == 1 ? '1 day ago' : '$days days ago';
  }
  if (days <= 0) return 'النهارده';
  if (days == 1) return 'امبارح';
  if (days == 2) return 'من يومين';
  if (days <= 10) return 'من $days أيام';
  return 'من $days يوم';
}

/// "4 غرف", "غرفتين", "1 bed": rooms with the Arabic dual and plural right.
String bedsText(int n) {
  if (isEn) return n == 1 ? '1 bed' : '$n beds';
  if (n == 1) return 'غرفة';
  if (n == 2) return 'غرفتين';
  return n <= 10 ? '$n غرف' : '$n غرفة';
}

String bathsText(int n) {
  if (isEn) return n == 1 ? '1 bath' : '$n baths';
  if (n == 1) return 'حمام';
  if (n == 2) return 'حمامين';
  return n <= 10 ? '$n حمامات' : '$n حمام';
}

/// The listing in a list: the photo, then price, the facts in one line of text, the
/// owner's headline, and where and when. No card frame around it (2026-10-26): the
/// photo's edge and the whitespace under the text are enough to separate units.
class ListingCardTile extends StatelessWidget {
  const ListingCardTile({
    super.key,
    required this.listing,
    required this.onTap,
  });

  final ListingCard listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AqarRadius.card),
      // Phones: photo on top, details below at full width. Wider screens keep the
      // photo beside the text.
      child: LayoutBuilder(
        builder: (context, c) => c.maxWidth < 440
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AqarRadius.card),
                    child: AspectRatio(aspectRatio: 16 / 10, child: _photo()),
                  ),
                  Padding(padding: const EdgeInsets.only(top: 10), child: _details()),
                ],
              )
            // IntrinsicHeight is what makes CrossAxisAlignment.stretch legal here: the
            // card sits in scrolling lists (unbounded height), and without it the row
            // throws "BoxConstraints forces an infinite height" and paints nothing.
            : IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // The photo strip is a scrollable, which cannot report an intrinsic
                    // height; the details column decides the row's height instead.
                    SizedBox(
                      width: 168,
                      child: _NoIntrinsicHeight(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AqarRadius.card),
                          child: _photo(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(child: _details()),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _details() {
    final facts = [
      unitTypeLabel(listing.type),
      if (listing.bedrooms > 0) bedsText(listing.bedrooms),
      bathsText(listing.bathrooms),
      '${formatNumber(listing.sizeSqm.round())} ${tr('م²', 'm²')}',
      listing.deliveryStatus == 'ready' ? tr('استلام فوري', 'Ready to move') : tr('تحت الإنشاء', 'Under construction'),
    ];
    final hasTags = listing.verdict == 'below' || listing.verdict == 'above' || listing.verdict == 'fair' || listing.withoutOver;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                formatPriceExact(listing.price, currency: listing.currency),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AqarType.figure(size: 18, weight: FontWeight.w700),
              ),
            ),
            SaveHeart(listingId: listing.id, size: 20),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          facts.join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13, height: 1.4, color: AqarColors.ink700, fontFeatures: AqarType.tnum),
        ),
        if (listing.title.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            listing.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, height: 1.4, color: AqarColors.ink500),
          ),
        ],
        if (hasTags) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              PriceVerdictBadge(verdict: listing.verdict),
              // "Direct from owner" left the cards (owner, 2026-10-24): every unit here
              // is owner-direct, and the home headline says so once.
              if (listing.withoutOver) AqarBadge.neutral(tr('بدون أوفر', 'Without over')),
            ],
          ),
        ],
        const SizedBox(height: 6),
        Text(
          '${listing.place()} · ${relativeDays(listing.daysOnMarket)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, color: AqarColors.ink400),
        ),
      ],
    );
  }

  /// A listing cannot publish without photos, so the empty state only appears when an
  /// image fails to load. A bare grey box reads as a broken card, so it says so.
  static Widget _noPhoto() => Container(
    color: AqarColors.ink100,
    alignment: Alignment.center,
    child: const Icon(
      Icons.image_not_supported_outlined,
      size: 20,
      color: AqarColors.ink400,
    ),
  );

  Widget _photo() {
    return Stack(
      fit: StackFit.expand,
      children: [
        if (listing.photos.isEmpty)
          _noPhoto()
        else
          // The card's photos, browsable in place (owner, 2026-10-24): swipe without
          // opening the listing; a tap still opens it. The first one is the cover
          // (src/lib/cover.ts on the server), so the app and the website lead with the
          // same image for the same unit.
          CardPhotos(photos: listing.photos, total: listing.photoCount, fallback: _noPhoto),
        PositionedDirectional(
          top: 8,
          start: 8,
          child: AqarBadge.verified(tr('موثق', 'Verified')),
        ),
        // How many photos sit behind the cover when they are not all swipeable here.
        // Forced LTR so the camera icon stays beside the number.
        if (listing.photoCount > 1 && listing.photos.length <= 1)
          PositionedDirectional(
            bottom: 8,
            end: 8,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: _OnPhoto(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.photo_camera_outlined, size: 11, color: Colors.white),
                    const SizedBox(width: 3),
                    Text(formatNumber(listing.photoCount), style: _OnPhoto.text),
                  ],
                ),
              ),
            ),
          ),
        if (listing.tourCount > 0)
          PositionedDirectional(
            bottom: 8,
            start: 8,
            child: _OnPhoto(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.videocam, size: 12, color: Colors.white),
                  const SizedBox(width: 3),
                  Text(tr('فيديو', 'Video'), style: _OnPhoto.text),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// A small dark label sitting on a photo.
class _OnPhoto extends StatelessWidget {
  const _OnPhoto({required this.child});
  final Widget child;

  static const text = TextStyle(fontSize: 11, height: 1.3, fontWeight: FontWeight.w600, color: Colors.white, fontFeatures: AqarType.tnum);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: AqarColors.ink900.withValues(alpha: 0.72),
          borderRadius: BorderRadius.circular(3),
        ),
        child: child,
      );
}

/// A card's photos as a swipeable strip with a "2/6" counter. Horizontal drags page
/// through the photos (mouse drags too, on the web); taps fall through to the card's
/// InkWell, so a tap still opens the listing. PageView follows the reading direction, so
/// in Arabic the next photo is to the left.
class CardPhotos extends StatefulWidget {
  const CardPhotos({super.key, required this.photos, this.total, this.showDots = true, required this.fallback});

  final List<String> photos;

  /// The listing's full photo count, when the card was sent only some of them.
  final int? total;

  /// Kept for older call sites; the counter replaced the dots.
  final bool showDots;
  final Widget Function() fallback;

  @override
  State<CardPhotos> createState() => _CardPhotosState();
}

class _CardPhotosState extends State<CardPhotos> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    final total = (widget.total ?? 0) > photos.length ? widget.total! : photos.length;
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          itemCount: photos.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) => CachedNetworkImage(
            imageUrl: absoluteMediaUrl(photos[i]),
            fit: BoxFit.cover,
            placeholder: (_, __) => Container(color: AqarColors.ink100),
            errorWidget: (_, __, ___) => widget.fallback(),
          ),
        ),
        if (photos.length > 1)
          PositionedDirectional(
            bottom: 8,
            end: 8,
            child: IgnorePointer(
              child: Directionality(
                textDirection: TextDirection.ltr,
                child: _OnPhoto(
                  child: Text('${_index + 1}/$total', style: _OnPhoto.text),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Reports zero intrinsic height, so a child that cannot compute one (a PageView) can sit
/// in an IntrinsicHeight row and simply take the height the other children decide.
class _NoIntrinsicHeight extends SingleChildRenderObjectWidget {
  const _NoIntrinsicHeight({required Widget super.child});

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderNoIntrinsicHeight();
}

class _RenderNoIntrinsicHeight extends RenderProxyBox {
  @override
  double computeMinIntrinsicHeight(double width) => 0;

  @override
  double computeMaxIntrinsicHeight(double width) => 0;

  @override
  double computeMinIntrinsicWidth(double height) => 0;

  @override
  double computeMaxIntrinsicWidth(double height) => 0;
}
