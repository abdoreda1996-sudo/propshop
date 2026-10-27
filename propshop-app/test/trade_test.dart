import 'package:flutter_test/flutter_test.dart';
import 'package:aqarsale_app/models/trade.dart';
import 'package:aqarsale_app/screens/listing_screen_loader.dart';

/// The app copies exactly one trade rule from the server (src/lib/trade.ts
/// validateTradeOffer): which way cash may flow given the owner's term. If these drift,
/// the offer sheet offers a direction the server refuses.
void main() {
  group('allowedPayers mirrors the server cash-direction rule', () {
    test('none → no cash at all', () => expect(allowedPayers('none'), isEmpty));
    test('i_receive → only the proposer pays', () => expect(allowedPayers('i_receive'), ['proposer']));
    test('i_pay → only the owner (recipient) pays', () => expect(allowedPayers('i_pay'), ['recipient']));
    test('either → both', () => expect(allowedPayers('either'), ['proposer', 'recipient']));
    test('unknown term falls back to either', () => expect(allowedPayers('???'), ['proposer', 'recipient']));
  });

  test('TradeOffer parses the server payload and knows who pays', () {
    final o = TradeOffer.fromJson({
      'id': 't1',
      'reference': 'TR-100001',
      'role': 'recipient',
      'status': 'pending',
      'live': true,
      'stage': null,
      'cancelReason': null,
      'cashAmount': 500000,
      'cashPayer': 'proposer',
      'expiresAt': '2026-10-16T00:00:00.000Z',
      'createdAt': '2026-10-02T00:00:00.000Z',
      'target': {'id': 'a', 'reference': 'AQ-1', 'titleAr': 'أ', 'titleEn': 'A', 'price': 10000000, 'currency': 'EGP', 'photo': null},
      'units': [
        {'id': 'b', 'reference': 'AQ-2', 'titleAr': '', 'titleEn': '', 'price': 9500000, 'currency': 'EGP', 'photo': '/media/x_400.webp'},
      ],
      'counterparty': null,
    });
    expect(o.needsMyReply, isTrue);
    expect(o.iPayCash, isFalse, reason: 'the proposer pays; I am the recipient');
    expect(o.units.single.title, 'AQ-2', reason: 'empty titles fall back to the reference');
    expect(o.counterpartyPhone, isNull, reason: 'contacts only arrive once accepted');
  });

  test('TradeWants: empty means open to anything', () {
    final w = TradeWants.fromJson({'types': [], 'areaIds': [], 'areas': [], 'cash': 'either'});
    expect(w.isOpenToAnything, isTrue);
    final w2 = TradeWants.fromJson({'types': ['villa'], 'areaIds': ['x'], 'areas': [{'id': 'x', 'nameAr': 'ت', 'nameEn': 'T'}], 'minBedrooms': 3, 'cash': 'i_receive'});
    expect(w2.isOpenToAnything, isFalse);
    expect(w2.minBedrooms, 3);
    expect(w2.areas.single.nameEn, 'T');
  });

  test('listingCardFromDetail builds a card from the detail payload, cover first', () {
    final card = listingCardFromDetail({
      'id': 'l1',
      'reference': 'AQ-100113',
      'titleAr': 'عنوان',
      'titleEn': 'Title',
      'price': 11400000,
      'currency': 'EGP',
      'purpose': 'sale',
      'paymentType': 'cash',
      'trustLevel': 3,
      'status': 'live',
      'verdict': 'fair',
      'fair': null,
      'unit': {'type': 'villa', 'bedrooms': 4, 'bathrooms': 3, 'sizeSqm': 280, 'finishing': 'fully_finished', 'deliveryStatus': 'ready', 'areaAr': 'ع', 'areaEn': 'A'},
      'media': [
        {'id': 'm1', 'url': 'u1', 'thumb': 't1', 'isCover': false},
        {'id': 'm2', 'url': 'u2', 'thumb': 't2', 'isCover': true},
      ],
    });
    expect(card.reference, 'AQ-100113');
    expect(card.photo, 't2');
    expect(card.bedrooms, 4);
    expect(card.status, 'live');
  });
}
