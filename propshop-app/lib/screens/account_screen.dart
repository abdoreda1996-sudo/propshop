import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api.dart';
import '../services/format.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'list_unit_screen.dart';
import 'login_screen.dart';
import 'messages_screen.dart';
import 'my_listings_screen.dart';
import 'open_request_screen.dart';
import 'requests_screen.dart';
import 'saved_screen.dart';
import 'settings_screen.dart';
import 'staff_screens.dart';
import 'trade_request_screens.dart';
import 'trades_screen.dart';
import 'verify_identity_screen.dart';
import 'viewings_screen.dart';

Map<int, String> get _trustLabels => {
  0: tr('الهوية لسه متوثقتش', 'Identity not verified yet'),
  1: tr('هوية موثقة', 'Identity verified'),
  2: tr('ملكية موثقة', 'Ownership verified'),
  3: tr('صور موثقة', 'Photos verified'),
  4: tr('معاينة ميدانية', 'Site-inspected'),
};

/// Account: who you are, the few numbers that matter, then everything else as a plain
/// list. It used to be eleven full-width outlined buttons with an icon each.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();

    if (session.loading && !session.isSignedIn) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    void push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

    if (!session.isSignedIn) {
      return Scaffold(
        appBar: AppBar(
          title: Text(tr('حسابي', 'My account')),
          actions: const [LangToggleButton()],
        ),
        body: EmptyState(
          title: tr('ادخل برقم موبايلك', 'Sign in with your mobile number'),
          body: tr(
            'هيوصلك كود في رسالة. رقمك مش بيظهر لأي حد على المنصة.',
            'We text you a code. Your number is never shown to anyone on the platform.',
          ),
          action: FilledButton(
            onPressed: () => push(const LoginScreen(toHome: true)),
            child: Text(tr('تسجيل الدخول', 'Sign in')),
          ),
        ),
      );
    }

    final counts = session.counts;
    int n(String key) => (counts[key] as num?)?.toInt() ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('حسابي', 'My account')),
        actions: const [LangToggleButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
        children: [
          Text(
            session.fullName,
            style: const TextStyle(fontSize: 22, height: 1.2, fontWeight: FontWeight.w700, color: AqarColors.ink900),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: session.trustLevel >= 1
                ? AqarBadge.verified(_trustLabels[session.trustLevel] ?? _trustLabels[1]!)
                : AqarBadge.neutral(_trustLabels[0]!),
          ),
          if (session.trustLevel < 1) ...[
            const SizedBox(height: 10),
            Text(
              tr(
                'عشان تعرض وحدة لازم توثق هويتك مرة واحدة: صورة البطاقة وسيلفي من التطبيق.',
                'To list a unit, verify your identity once: a photo of your national ID and a selfie in the app.',
              ),
              style: const TextStyle(fontSize: 13, height: 1.6, color: AqarColors.ink500),
            ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => push(const VerifyIdentityScreen()),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 0)),
                child: Text(tr('وثّق هويتك', 'Verify your identity')),
              ),
            ),
          ],

          const SizedBox(height: 20),
          Row(
            children: [
              _Figure(value: n('activeListings'), label: tr('إعلان نشط', 'active listings')),
              _Figure(value: n('openRequests'), label: tr('طلب مفتوح', 'open requests')),
              _Figure(value: n('saved'), label: tr('محفوظة', 'saved')),
            ],
          ),
          const SizedBox(height: 20),
          // The owner's primary action, as on the website.
          FilledButton(
            onPressed: () => push(const ListUnitScreen()),
            child: Text(tr('اعرض وحدتك', 'List your unit')),
          ),

          const SizedBox(height: 28),
          SectionTitle(tr('البيع والشراء', 'Buying and selling'), padding: EdgeInsets.zero),
          PlainRow(label: tr('وحداتي', 'My properties'), onTap: () => push(const MyListingsScreen())),
          PlainRow(
            label: tr('المعاينات', 'Viewings'),
            trailing: _Count(n('awaitingViewings'), urgent: true),
            onTap: () => push(const ViewingsScreen()),
          ),
          PlainRow(
            label: tr('المقايضة', 'Trades'),
            trailing: _Count(n('awaitingTrades'), urgent: true),
            onTap: () => push(const TradesScreen()),
          ),
          PlainRow(
            label: tr('المحفوظة', 'Saved'),
            trailing: _Count(n('saved')),
            onTap: () => push(const SavedScreen()),
          ),
          PlainRow(label: tr('طلباتي', 'My requests'), onTap: () => push(const RequestsScreen())),
          // The advisor path is kept but demoted: it is for buyers who cannot find a
          // unit, not the way you transact on one.
          PlainRow(
            label: tr('اطلب وحدة', 'Request a unit'),
            detail: tr('قولنا بتدور على إيه وفريقنا يدورلك', 'Tell us what you want and our team looks for it'),
            onTap: () => push(const OpenRequestScreen()),
          ),

          const SizedBox(height: 28),
          SectionTitle(tr('الرسايل والتنبيهات', 'Messages and alerts'), padding: EdgeInsets.zero),
          PlainRow(
            label: tr('الإشعارات', 'Notifications'),
            trailing: _Count(session.unreadNotifications, urgent: true),
            onTap: () => push(const NotificationsScreen()),
          ),
          PlainRow(label: tr('الرسايل', 'Messages'), onTap: () => push(const MessagesScreen())),

          const SizedBox(height: 28),
          SectionTitle(tr('الحساب', 'Account'), padding: EdgeInsets.zero),
          PlainRow(label: tr('الإعدادات', 'Settings'), onTap: () => push(const SettingsScreen())),
          PlainRow(
            label: tr('اللغة', 'Language'),
            onTap: () => LangController.instance.toggle(context),
            trailing: Text(
              isEn ? 'English · عربي' : 'العربية · English',
              style: const TextStyle(fontSize: 13, color: AqarColors.ink500),
            ),
          ),
          // Back office: only staff roles see it; the server checks every call anyway.
          if (session.isStaff)
            PlainRow(
              label: tr('لوحة فريق العمل', 'Team panel'),
              detail: tr('التوثيق والطلبات والمعاينات والمقايضات', 'Verification, requests, viewings and trades'),
              onTap: () => push(const StaffHomeScreen()),
            ),

          const SizedBox(height: 24),
          // The website's information pages, opened in the browser rather than copied
          // into the app, so there is one version of each.
          const _InfoLinks(),
          const SizedBox(height: 12),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => context.read<SessionController>().signOut(),
              style: TextButton.styleFrom(
                foregroundColor: AqarColors.danger,
                padding: EdgeInsets.zero,
              ),
              child: Text(tr('تسجيل الخروج', 'Sign out')),
            ),
          ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.value, required this.label});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(formatNumber(value), style: AqarType.figure(size: 22)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 12, color: AqarColors.ink500)),
        ],
      ),
    );
  }
}

/// The count at the end of a row, followed by the chevron the row would have shown.
class _Count extends StatelessWidget {
  const _Count(this.n, {this.urgent = false});
  final int n;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CountTag(n, urgent: urgent),
        Icon(isEn ? Icons.chevron_right : Icons.chevron_left, size: 18, color: AqarColors.ink400),
      ],
    );
  }
}

class _InfoLinks extends StatelessWidget {
  const _InfoLinks();

  @override
  Widget build(BuildContext context) {
    final links = [
      (tr('الرسوم', 'Fees'), '/pricing'),
      (tr('إزاي بنشتغل', 'How it works'), '/how-it-works'),
      // The optional 360° home tour, sold on the pricing page (owner, 2026-10-24).
      (tr('جولة 360 لبيتك', '360 home tour'), '/virtual-tour'),
      (tr('الشروط', 'Terms'), '/legal/terms'),
      (tr('الخصوصية', 'Privacy'), '/legal/privacy'),
    ];
    return Wrap(
      spacing: 16,
      runSpacing: 4,
      children: [
        for (final (label, path) in links)
          InkWell(
            onTap: () => launchUrl(Uri.parse('${Api.defaultBaseUrl}$path'), mode: LaunchMode.externalApplication),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(label, style: const TextStyle(fontSize: 13, color: AqarColors.ink500)),
            ),
          ),
      ],
    );
  }
}
