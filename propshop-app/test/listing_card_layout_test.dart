import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/models/listing.dart';
import 'package:aqarsale_app/widgets/listing_card.dart';
import 'package:aqarsale_app/theme/tokens.dart';

/// Regression: the card must survive an UNBOUNDED height.
///
/// widget_test.dart wraps the card in a fixed-size SizedBox, which is a bounded context
/// and hid a real bug: every screen actually puts this card in a scrolling list, and a
/// list hands its children unbounded height. The card's Row used
/// CrossAxisAlignment.stretch, which resolves to tightFor(height: infinity) there and
/// throws "BoxConstraints forces an infinite height" — the card painted nothing at all,
/// on both the browse screen and Discover, while the tests stayed green.
///
/// These two cases are the two shapes the app really uses.
ListingCard _fixture() => ListingCard.fromJson({
      'id': 'l1',
      'reference': 'AQ-100001',
      'titleAr': 'شقة 4 غرف 249 م² في ميفيدا',
      'titleEn': 'Apartment 249 sqm in Mivida',
      'price': 9800000,
      'currency': 'EGP',
      'purpose': 'sale',
      'paymentType': 'cash',
      'photo': null,
      'photoCount': 6,
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
      'verdict': 'below',
    });

Widget _app(Widget body) => MaterialApp(
      theme: buildAqarTheme(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: body),
      ),
    );

void main() {
  testWidgets('renders as a direct list item (the browse screen)', (tester) async {
    await tester.pumpWidget(_app(
      ListView.separated(
        itemCount: 3,
        separatorBuilder: (_, __) => const SizedBox(height: 14),
        itemBuilder: (_, __) => ListingCardTile(listing: _fixture(), onTap: () {}),
      ),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('موثق'), findsNWidgets(3));
    // A card that laid out at zero height is the exact failure mode being guarded.
    expect(tester.getSize(find.byType(ListingCardTile).first).height, greaterThan(60));
  });

  testWidgets('renders inside a Column inside a list (Discover)', (tester) async {
    await tester.pumpWidget(_app(
      ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [ListingCardTile(listing: _fixture(), onTap: () {})],
            ),
          ),
        ],
      ),
    ));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('موثق'), findsOneWidget);
    expect(tester.getSize(find.byType(ListingCardTile)).height, greaterThan(60));
  });
}
