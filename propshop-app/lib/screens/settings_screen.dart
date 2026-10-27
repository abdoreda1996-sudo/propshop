import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';

/// Account settings — the app's twin of /dashboard/settings, on PATCH /api/auth/me.
/// The name locks once identity is verified (the server enforces it; the field is shown
/// read-only so nobody types a change that will be refused).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final SessionController _session = context.read<SessionController>();
  late final _name = TextEditingController(text: _session.fullName);
  late final _email = TextEditingController(text: (_session.user?['email'] ?? '') as String);
  late String _currency = (_session.user?['preferredCurrency'] ?? 'EGP') as String;
  late String _channel = (_session.user?['preferredChannel'] ?? 'in_app') as String;
  late String _country = (_session.user?['countryOfResidence'] ?? 'EG') as String;
  bool _busy = false;
  String? _msg;
  bool _ok = false;

  static const _currencies = ['EGP', 'SAR', 'AED', 'USD', 'KWD', 'QAR'];
  static const _countries = ['EG', 'SA', 'AE', 'KW', 'QA', 'US', 'GB'];
  static const _channels = ['in_app', 'whatsapp', 'call'];

  /// Country names, not ISO codes, in the dropdown.
  static String _countryName(String c) => switch (c) {
        'EG' => tr('مصر', 'Egypt'),
        'SA' => tr('السعودية', 'Saudi Arabia'),
        'AE' => tr('الإمارات', 'UAE'),
        'KW' => tr('الكويت', 'Kuwait'),
        'QA' => tr('قطر', 'Qatar'),
        'US' => tr('أمريكا', 'United States'),
        'GB' => tr('بريطانيا', 'United Kingdom'),
        _ => c,
      };

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await context.read<Api>().updateProfile({
        if (_session.trustLevel < 1) 'fullName': _name.text.trim(),
        'email': _email.text.trim(),
        'preferredCurrency': _currency,
        'preferredChannel': _channel,
        'countryOfResidence': _country,
        'locale': isEn ? 'en' : 'ar',
      });
      await _session.refresh();
      if (mounted) {
        setState(() {
          _ok = true;
          _msg = tr('اتحفظ', 'Saved');
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _ok = false;
          _msg = switch (e.code) {
            'invalid_email' => tr('الإيميل مش صحيح.', 'That email is not valid.'),
            'email_taken' => tr('الإيميل ده مستخدم في حساب تاني.', 'That email is used by another account.'),
            'name_too_short' => tr('الاسم قصير قوي.', 'The name is too short.'),
            _ => tr('حصلت مشكلة (${e.code}).', 'Something went wrong (${e.code}).'),
          };
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = _session.trustLevel >= 1;
    return Scaffold(
      appBar: AppBar(title: Text(tr('الإعدادات', 'Settings')), actions: const [LangToggleButton()]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _name,
            readOnly: locked,
            decoration: InputDecoration(
              labelText: tr('الاسم بالكامل', 'Full name'),
              helperText: locked ? tr('الاسم مقفول بعد توثيق الهوية.', 'Locked once your identity is verified.') : null,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: tr('الإيميل (اختياري)', 'Email (optional)')),
          ),
          const SizedBox(height: 12),
          // The label follows the reading direction; only the number itself is LTR.
          Text.rich(
            TextSpan(children: [
              TextSpan(text: '${tr('الموبايل', 'Mobile')}  '),
              TextSpan(
                text: '\u2066${_session.user?['phone'] ?? ''}\u2069',
                style: const TextStyle(color: AqarColors.ink900, fontFeatures: AqarType.tnum),
              ),
            ]),
            style: const TextStyle(fontSize: 14, color: AqarColors.textMuted),
          ),
          const SizedBox(height: 18),
          DropdownButtonFormField<String>(
            initialValue: _countries.contains(_country) ? _country : 'EG',
            decoration: InputDecoration(labelText: tr('بلد الإقامة', 'Country of residence')),
            items: [for (final c in _countries) DropdownMenuItem(value: c, child: Text(_countryName(c)))],
            onChanged: (v) => setState(() => _country = v ?? 'EG'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _currencies.contains(_currency) ? _currency : 'EGP',
            decoration: InputDecoration(labelText: tr('العملة المفضلة', 'Preferred currency')),
            items: [for (final c in _currencies) DropdownMenuItem(value: c, child: Text(c))],
            onChanged: (v) => setState(() => _currency = v ?? 'EGP'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            // An unknown stored value would trip the dropdown's assertion and blank the screen.
            initialValue: _channels.contains(_channel) ? _channel : 'in_app',
            decoration: InputDecoration(labelText: tr('طريقة التواصل المفضلة', 'Preferred contact channel')),
            items: [
              DropdownMenuItem(value: 'in_app', child: Text(tr('داخل التطبيق', 'In the app'))),
              DropdownMenuItem(value: 'whatsapp', child: Text(tr('واتساب', 'WhatsApp'))),
              DropdownMenuItem(value: 'call', child: Text(tr('مكالمة', 'Phone call'))),
            ],
            onChanged: (v) => setState(() => _channel = v ?? 'in_app'),
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? tr('جاري…', 'Working…') : tr('احفظ', 'Save'))),
          if (_msg != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_msg!, style: TextStyle(color: _ok ? AqarColors.ok700 : AqarColors.danger, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}
