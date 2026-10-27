import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/models/listing.dart';
import 'package:aqarsale_app/models/tour.dart';
import 'package:aqarsale_app/widgets/listing_card.dart';
import 'package:aqarsale_app/theme/tokens.dart';

/// A card must lead with the verification badge and show the fair-price verdict. The
/// "direct from owner" badge was removed from cards (owner, 2026-10-24) — the whole
/// marketplace is owner-direct, so the hero says it once instead.
ListingCard fixture({String verdict = 'below', double price = 9800000, int photoCount = 6, int tourCount = 0}) =>
    ListingCard.fromJson({
      'id': 'l1',
      'reference': 'AQ-100001',
      'titleAr': 'شقة 4 غرف 249 م² في ميفيدا',
      'titleEn': 'Apartment 249 sqm in Mivida',
      'price': price,
      'currency': 'EGP',
      'purpose': 'sale',
      'paymentType': 'cash',
      'photo': null,
      'photoCount': photoCount,
      'tourCount': tourCount,
      'compoundAr': 'ميفيدا',
      'compoundEn': 'Mivida',
      'areaAr': 'القاهرة الجديدة',
      'areaEn': 'New Cairo',
      'type': 'apartment',
      'bedrooms': 4,
      'bathrooms': 3,
      'sizeSqm': 249,
      'finishing': 'fully_finished',
      'deliveryStatus': 'ready',
      'trustLevel': 3,
      'daysOnMarket': 12,
      'fair': {'low': 10035000, 'mid': 11000000, 'high': 12775000, 'confidence': 'low'},
      'verdict': verdict,
    });

Widget wrap(Widget child) => MaterialApp(
      theme: buildAqarTheme(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: SizedBox(width: 390, child: child)),
      ),
    );

void main() {
  testWidgets('card shows the trust signals and a formatted price', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(), onTap: () {})));
    await tester.pump();

    expect(find.text('موثق'), findsOneWidget);
    expect(find.text('من المالك مباشرة'), findsNothing);
    // The card shows the exact price, as the reference marketplace does. The abbreviated
    // form (9.8 مليون) still exists and its web parity is covered in format_test.dart.
    expect(find.text('9,800,000 ج.م'), findsOneWidget);
    expect(find.text('أقل من السعر العادل'), findsOneWidget);
    expect(find.textContaining('من 12 يوم'), findsOneWidget);
  });

  testWidgets('an above-fair listing says so', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(verdict: 'above'), onTap: () {})));
    await tester.pump();
    expect(find.text('أعلى من السعر العادل'), findsOneWidget);
  });

  testWidgets('no verdict badge when there is not enough data', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(verdict: 'unknown'), onTap: () {})));
    await tester.pump();
    expect(find.text('أقل من السعر العادل'), findsNothing);
    expect(find.text('أعلى من السعر العادل'), findsNothing);
    expect(find.text('في نطاق السعر العادل'), findsNothing);
  });

  testWidgets('tapping a card invokes its callback', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(), onTap: () => tapped = true)));
    await tester.pump();
    await tester.tap(find.byType(InkWell).first);
    expect(tapped, isTrue);
  });

  testWidgets('the card counts the photos behind the cover', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(), onTap: () {})));
    await tester.pump();

    // Latin digits, matching the web card and the rest of the app's numbers.
    expect(find.text('6'), findsOneWidget);
    expect(find.byIcon(Icons.photo_camera_outlined), findsOneWidget);
  });

  testWidgets('a single-photo listing shows no count', (tester) async {
    // "1" beside a camera icon tells the buyer nothing they cannot already see.
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(photoCount: 1), onTap: () {})));
    await tester.pump();

    expect(find.byIcon(Icons.photo_camera_outlined), findsNothing);
  });

  testWidgets('a listing with no photo says so instead of showing a blank box', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(), onTap: () {})));
    await tester.pump();

    expect(find.byIcon(Icons.image_not_supported_outlined), findsOneWidget);
  });

  testWidgets('a listing with an approved tour shows the video-tour badge', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(tourCount: 1), onTap: () {})));
    await tester.pump();
    expect(find.byIcon(Icons.videocam), findsOneWidget);
  });

  testWidgets('no tour, no badge', (tester) async {
    await tester.pumpWidget(wrap(ListingCardTile(listing: fixture(), onTap: () {})));
    await tester.pump();
    expect(find.byIcon(Icons.videocam), findsNothing);
  });

  test('tour payload: kinds, immersive providers and review status', () {
    final video = Tour.fromJson({'id': 't1', 'kind': 'video', 'provider': 'upload', 'url': '/media/x_tour.mp4', 'status': 'pending'});
    expect(video.isVideo, isTrue);
    expect(video.isImmersive, isFalse);
    expect(video.status, 'pending');
    final mp = Tour.fromJson({'id': 't2', 'kind': 'embed', 'provider': 'matterport', 'url': 'https://my.matterport.com/show/?m=SxQL3iGyoDo'});
    expect(mp.isImmersive, isTrue);
    // Public payloads carry no status: what the public sees is approved by definition.
    expect(mp.status, 'approved');
    expect(Tour.fromJson({'id': 't3', 'kind': 'embed', 'provider': 'youtube', 'url': 'u', 'title': 'Walkthrough'}).caption, 'Walkthrough');
  });
}
