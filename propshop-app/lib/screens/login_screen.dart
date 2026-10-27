import 'package:flutter/material.dart';
import '../widgets/brand_logo.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import 'home_screen.dart';
import 'team_login_screen.dart';

/// Phone OTP sign-in for Egypt and the Gulf. Pops with `true` once signed in, so a
/// caller that needed authentication can continue where it left off — or, with
/// [toHome], lands on the Home tab (a plain "Log in", as the website's default next=/).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.signup = false, this.toHome = false});

  /// Opened from "Sign up": same phone-OTP flow, a heading that says what it is.
  final bool signup;

  /// Signed in from no particular task: go to the home screen afterwards.
  final bool toHome;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();

  bool _codeSent = false;
  bool _needsName = false;
  bool _busy = false;

  /// The error CODE, translated at render so a language switch re-reads it.
  String? _error;
  String? _devCode;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  String _message(String code) {
    switch (code) {
      case 'invalid_phone':
        return tr(
          'رقم موبايل غير صحيح. استخدم رقم مصري أو خليجي.',
          'Invalid mobile number. Use an Egyptian or Gulf number.',
        );
      case 'code_incorrect':
        return tr('الكود غلط. جرّب تاني.', 'Wrong code. Try again.');
      case 'code_expired':
        return tr(
          'الكود انتهت صلاحيته. اطلب كود جديد.',
          'The code has expired. Request a new one.',
        );
      case 'name_required':
        return tr(
          'أول مرة تسجل؟ اكتب اسمك بالكامل زي ما هو في البطاقة.',
          'First time here? Enter your full name as it appears on your ID.',
        );
      case 'too_many_requests':
      case 'too_many_attempts':
        return tr(
          'محاولات كتير. استنى شوية وجرّب تاني.',
          'Too many attempts. Wait a little and try again.',
        );
      case 'account_blocked':
        return tr(
          'الحساب ده موقوف. لو شايف إن ده غلط، تواصل مع الدعم.',
          'This account is suspended. If you think this is a mistake, contact support.',
        );
      case 'network_error':
        return tr(
          'مش قادرين نوصل للسيرفر. اتأكد من الإنترنت.',
          "We can't reach the server. Check your internet connection.",
        );
      default:
        return tr(
          'حصل خطأ غير متوقع ($code).',
          'Something unexpected went wrong ($code).',
        );
    }
  }

  Future<void> _requestCode() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final json = await context.read<Api>().requestOtp(_phone.text.trim());
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _needsName = json['isNewUser'] == true;
        _devCode = json['devCode'] as String?;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Signed in: back to the caller, or to the Home tab.
  void _done() {
    if (widget.toHome) {
      HomeScreen.tab.value = 0;
      Navigator.of(context).popUntil((r) => r.isFirst);
    } else {
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<Api>().verifyOtp(
        _phone.text.trim(),
        _code.text.trim(),
        fullName: _name.text.trim().isEmpty ? null : _name.text.trim(),
      );
      if (!mounted) return;
      await context.read<SessionController>().refresh();
      if (!mounted) return;
      _done();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.code == 'name_required') _needsName = true;
        _error = e.code;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.signup ? tr('حساب جديد', 'Sign up') : tr('تسجيل الدخول', 'Sign in')),
        actions: const [LangToggleButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 44, color: AqarColors.accent500)),
          const SizedBox(height: 28),
          Text(
            widget.signup
                ? tr('اعمل حسابك برقم موبايلك', 'Create your account with your mobile number')
                : tr('سجّل برقم موبايلك', 'Sign in with your mobile number'),
            style: const TextStyle(
              fontSize: 22,
              height: 1.25,
              fontWeight: FontWeight.w700,
              color: AqarColors.ink900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            tr(
              'رقمك مش بيظهر لأي حد على المنصة، ومابيتباعش ولا بيتشارك.',
              'Your number is never shown to anyone on the platform, and it is never sold or shared.',
            ),
            style: const TextStyle(
              fontSize: 14,
              height: 1.55,
              color: AqarColors.textMuted,
            ),
          ),
          const SizedBox(height: 24),

          TextField(
            controller: _phone,
            enabled: !_codeSent,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
            ],
            decoration: InputDecoration(
              labelText: tr('رقم الموبايل', 'Mobile number'),
              hintText: '01XXXXXXXXX',
              helperText: tr(
                'بنقبل أرقام مصر والسعودية والإمارات والكويت وقطر',
                'We accept numbers from Egypt, Saudi Arabia, the UAE, Kuwait and Qatar',
              ),
            ),
          ),

          if (_codeSent) ...[
            const SizedBox(height: 16),
            if (_devCode != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AqarColors.ink100,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  tr(
                    'نسخة تجريبية، الكود: $_devCode',
                    'Test build. Your code: $_devCode',
                  ),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AqarColors.ink900,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              textDirection: TextDirection.ltr,
              textAlign: TextAlign.center,
              maxLength: 6,
              style: const TextStyle(
                fontSize: 20,
                letterSpacing: 8,
                fontWeight: FontWeight.w700,
              ),
              decoration: InputDecoration(
                labelText: tr('كود التحقق', 'Verification code'),
                counterText: '',
              ),
            ),
            if (_needsName) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _name,
                decoration: InputDecoration(
                  labelText: tr('الاسم بالكامل', 'Full name'),
                  helperText: tr(
                    'زي ما هو مكتوب في البطاقة، عشان بنطابقه وقت التوثيق',
                    'As written on your ID. We match it during verification.',
                  ),
                ),
              ),
            ],
          ],

          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(
              _message(_error!),
              style: const TextStyle(fontSize: 13, color: AqarColors.danger),
            ),
          ],

          const SizedBox(height: 22),
          FilledButton(
            onPressed: _busy
                ? null
                : _codeSent
                ? _verify
                : _requestCode,
            child: Text(
              _busy
                  ? tr('جاري…', 'Working…')
                  : (_codeSent
                        ? tr('تحقق', 'Verify')
                        : tr('أرسل كود التحقق', 'Send verification code')),
            ),
          ),

          // A typo in the number used to be a dead end: the field locks once a code is
          // sent. "Change number" unlocks it.
          if (_codeSent)
            Wrap(
              spacing: 4,
              children: [
                TextButton(
                  onPressed: _busy ? null : _requestCode,
                  child: Text(tr('ابعت الكود تاني', 'Resend code')),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _codeSent = false;
                            _needsName = false;
                            _devCode = null;
                            _error = null;
                            _code.clear();
                          }),
                  child: Text(tr('غيّر الرقم', 'Change number')),
                ),
              ],
            ),

          const SizedBox(height: 28),
          const Divider(),
          // Staff use their back-office email + password, not a phone code.
          TextButton(
            onPressed: _busy
                ? null
                : () async {
                    final ok = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(builder: (_) => const TeamLoginScreen()),
                    );
                    if (ok == true && context.mounted) _done();
                  },
            child: Text(tr('دخول فريق العمل', 'Team sign-in')),
          ),
        ],
      ),
    );
  }
}
