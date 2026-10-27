import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/models/offer.dart';
import 'package:aqarsale_app/models/deal.dart';

/// The app duplicates two server rules so it can grey out impossible buttons: when an
/// offer is still live, and whose move it is. If either drifts from
/// propshop-web/src/lib/offers.ts the app will offer actions the server then refuses,
/// which reads as a broken product.
///
/// These pin the Dart side. The server's own copies are in
/// propshop-web/src/lib/__tests__/offers.test.ts.

Map<String, dynamic> stepJson({
  String id = 'o1',
  String direction = 'buyer',
  String status = 'pending',
  double amount = 9000000,
  DateTime? expiresAt,
}) =>
    {
      'id': id,
      'direction': direction,
      'status': status,
      'amount': amount,
      'message': null,
      'expiresAt': expiresAt?.toIso8601String(),
      'createdAt': DateTime.now().toIso8601String(),
    };

Map<String, dynamic> chainJson({
  String role = 'buyer',
  String? awaiting,
  String status = 'pending',
  List<Map<String, dynamic>>? steps,
}) =>
    {
      'listing': {
        'id': 'l1',
        'reference': 'AQ-100001',
        'titleAr': 'شقة في ميفيدا',
        'price': 10000000,
        'currency': 'EGP',
        'status': 'live',
      },
      'role': role,
      'status': status,
      'awaiting': awaiting,
      'latestAmount': 9000000,
      'counterparty': {
        'ref': 4821,
        'side': role == 'buyer' ? 'seller' : 'buyer',
        'memberSince': 2022,
        'identityVerified': true,
        'fundsVerified': false,
        'ownershipVerified': true,
      },
      'steps': steps ?? [stepJson()],
    };

void main() {
  group('offer liveness', () {
    test('a pending offer with no expiry is live', () {
      expect(OfferStep.fromJson(stepJson()).isLive, isTrue);
    });

    test('an offer past its expiry is dead even though status still says pending', () {
      // The bug this guards: the row has not been swept, so the app would otherwise
      // show Accept on an offer the server will refuse.
      final s = OfferStep.fromJson(
        stepJson(expiresAt: DateTime.now().subtract(const Duration(hours: 1))),
      );
      expect(s.status, 'pending');
      expect(s.isLive, isFalse);
      expect(s.effectiveStatus, 'expired');
    });

    test('an offer expiring later is still live', () {
      final s = OfferStep.fromJson(
        stepJson(expiresAt: DateTime.now().add(const Duration(hours: 1))),
      );
      expect(s.isLive, isTrue);
      expect(s.effectiveStatus, 'pending');
    });

    test('a settled offer is never live', () {
      for (final status in ['accepted', 'rejected', 'withdrawn', 'countered', 'expired']) {
        expect(OfferStep.fromJson(stepJson(status: status)).isLive, isFalse, reason: status);
      }
    });
  });

  group('whose move it is', () {
    test('the buyer acts when the seller made the last step', () {
      final c = OfferChain.fromJson(chainJson(role: 'buyer', awaiting: 'buyer'));
      expect(c.myMove, isTrue);
    });

    test('the buyer waits when their own offer is outstanding', () {
      final c = OfferChain.fromJson(chainJson(role: 'buyer', awaiting: 'seller'));
      expect(c.myMove, isFalse);
    });

    test('the seller acts when the buyer made the last step', () {
      final c = OfferChain.fromJson(chainJson(role: 'seller', awaiting: 'seller'));
      expect(c.myMove, isTrue);
    });

    test('a settled chain is nobody\'s move', () {
      // The step must be settled too: a chain is only settled when its last step is.
      final c = OfferChain.fromJson(chainJson(
        role: 'buyer',
        awaiting: null,
        status: 'accepted',
        steps: [stepJson(status: 'accepted')],
      ));
      expect(c.myMove, isFalse);
      expect(c.liveStep, isNull);
    });

    test('liveStep skips settled steps and finds the outstanding one', () {
      final c = OfferChain.fromJson(chainJson(steps: [
        stepJson(id: 'a', status: 'countered'),
        stepJson(id: 'b', direction: 'seller', status: 'pending'),
      ]));
      expect(c.liveStep?.id, 'b');
    });

    test('a chain whose only step lapsed has no live step', () {
      final c = OfferChain.fromJson(chainJson(steps: [
        stepJson(expiresAt: DateTime.now().subtract(const Duration(days: 1))),
      ]));
      expect(c.liveStep, isNull);
    });
  });

  group('pseudonymous identity', () {
    test('renders a handle, never a name', () {
      final c = OfferChain.fromJson(chainJson(role: 'buyer'));
      expect(c.counterparty.label, 'مالك موثق #4821');
    });

    test('a missing handle degrades to the bare label', () {
      final id = PublicIdentity.fromJson({'side': 'buyer', 'memberSince': 2024});
      expect(id.label, 'مشتري موثق');
    });

    test('the model has no field that could carry a name or phone', () {
      // Structural guard: PublicIdentity is the only thing the app is given about a
      // counterparty, and it deliberately cannot hold identifying data.
      final id = PublicIdentity.fromJson({
        'ref': 1,
        'side': 'seller',
        'fullName': 'Should Be Ignored',
        'phone': '+201000000000',
      });
      expect(id.label.contains('Should'), isFalse);
      expect(id.label.contains('201000000000'), isFalse);
    });
  });

  group('deal timeline', () {
    test('marks done, current and upcoming around the stage', () {
      final t = dealTimeline('due_diligence');
      expect(t.firstWhere((s) => s.stage == 'offer_accepted').state, DealStepState.done);
      expect(t.firstWhere((s) => s.stage == 'due_diligence').state, DealStepState.current);
      expect(t.firstWhere((s) => s.stage == 'transfer').state, DealStepState.upcoming);
    });

    test('a cancelled deal shows one honest step, not a fake progress bar', () {
      final t = dealTimeline('cancelled');
      expect(t.length, 1);
      expect(t.first.stage, 'cancelled');
    });

    test('an unknown stage degrades to the start instead of throwing', () {
      expect(dealTimeline('nonsense').first.state, DealStepState.current);
    });

    test('progress is a position on the path, not a percentage', () {
      final d = Deal.fromJson({'stage': 'contract_signing'});
      final (done, total) = d.progress;
      expect(done, 3);
      expect(total, 5);
    });

    test('a reservation that has lapsed reports zero, never negative', () {
      final d = Deal.fromJson({
        'stage': 'reserved',
        'reservedUntil': DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
      });
      expect(d.holdRemaining, Duration.zero);
    });
  });

  group('viewings', () {
    test('open statuses are actionable, settled ones are not', () {
      Viewing v(String status) => Viewing.fromJson({
            'id': 'v1',
            'listing': {'reference': 'AQ-1', 'titleAr': 'وحدة'},
            'role': 'buyer',
            'status': status,
            'slots': <String>[],
          });
      expect(v('requested').isOpen, isTrue);
      expect(v('proposed').isOpen, isTrue);
      expect(v('accepted').isOpen, isTrue);
      expect(v('declined').isOpen, isFalse);
      expect(v('cancelled').isOpen, isFalse);
      expect(v('completed').isOpen, isFalse);
    });
  });
}
