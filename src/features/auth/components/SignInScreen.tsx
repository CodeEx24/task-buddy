import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Input } from '@/components/ui';

import { requestCode, verifyCode, type AuthFailure } from '../api/auth-api';
import { SIGN_IN_COPY, SIGN_IN_ERRORS } from '../copy';
import { useResendCountdown } from '../hooks/use-resend-countdown';
import { emailSchema, maskEmail, normalizeOtpInput, otpCodeSchema } from '../schema';

type Step = 'email' | 'code';

/** Client lockout: after this many wrong codes for one sent code, verifying needs a new code. */
export const MAX_WRONG_CODES_PER_SEND = 5;

function messageFor(reason: AuthFailure, step: Step): string {
  switch (reason) {
    case 'invalid_email':
      return SIGN_IN_ERRORS.invalidEmail;
    case 'invalid_code':
      return SIGN_IN_ERRORS.invalidCode;
    case 'rate_limited':
      return step === 'email' ? SIGN_IN_ERRORS.rateLimitedSend : SIGN_IN_ERRORS.rateLimitedVerify;
    case 'network':
      return SIGN_IN_ERRORS.network;
    default:
      return SIGN_IN_ERRORS.unknown;
  }
}

/**
 * Email OTP sign-in (TB-20): email → 6-digit code. On success supabase-js stores the session and
 * the root route guard swaps this screen for Today, so there is no navigation call here.
 */
export function SignInScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);
  // In-flight guard that doesn't depend on a render (auto-submit + a quick tap must verify once).
  const isVerifyingRef = useRef(false);
  // Wrong codes for the current send; a ref so auto-submit can't race past the limit.
  const wrongCodesRef = useRef(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const secondsLeft = useResendCountdown(sentAt);

  const parsedEmail = emailSchema.safeParse(email);
  const isCodeComplete = otpCodeSchema.safeParse(code).success;

  async function sendCode(target: string, isResend: boolean) {
    setIsSending(true);
    setError(undefined);
    setNotice(undefined);
    const result = await requestCode(target);
    setIsSending(false);
    if (!result.ok) {
      setError(messageFor(result.reason, isResend ? 'code' : 'email'));
      return;
    }
    setSentEmail(target);
    setSentAt(Date.now());
    setStep('code');
    // A new code resets the lockout (only after the server accepted the send).
    wrongCodesRef.current = 0;
    setIsLockedOut(false);
    if (isResend) {
      setCode('');
      lastSubmittedCode.current = null;
      setNotice(SIGN_IN_COPY.codeResent);
    }
  }

  async function submitCode(value: string) {
    if (
      isVerifyingRef.current ||
      wrongCodesRef.current >= MAX_WRONG_CODES_PER_SEND ||
      !otpCodeSchema.safeParse(value).success
    ) {
      return;
    }
    isVerifyingRef.current = true;
    lastSubmittedCode.current = value;
    setIsVerifying(true);
    setError(undefined);
    setNotice(undefined);
    const result = await verifyCode(sentEmail, value);
    isVerifyingRef.current = false;
    setIsVerifying(false);
    if (result.ok) return;
    if (result.reason === 'invalid_code') {
      wrongCodesRef.current += 1;
      // Same copy as any wrong code (it already says to request a new one): nothing new revealed.
      if (wrongCodesRef.current >= MAX_WRONG_CODES_PER_SEND) setIsLockedOut(true);
    }
    setError(messageFor(result.reason, 'code'));
  }

  function onCodeChange(text: string) {
    const next = normalizeOtpInput(text);
    setCode(next);
    // Autofill / paste / the sixth digit submits once per distinct code.
    if (otpCodeSchema.safeParse(next).success && lastSubmittedCode.current !== next) {
      void submitCode(next);
    }
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError(undefined);
    setNotice(undefined);
    lastSubmittedCode.current = null;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="sign-in-screen"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow justify-center gap-xl p-xl"
        >
          {step === 'email' ? (
            <View className="gap-lg" testID="sign-in-email-step">
              <Text accessibilityRole="header" className="text-2xl font-bold text-text">
                {SIGN_IN_COPY.title}
              </Text>
              <Text className="text-base text-text-muted">{SIGN_IN_COPY.emailIntro}</Text>
              <Input
                testID="sign-in-email"
                label={SIGN_IN_COPY.emailLabel}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(undefined);
                }}
                error={error}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                inputMode="email"
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (parsedEmail.success && !isSending) void sendCode(parsedEmail.data, false);
                }}
              />
              <Button
                testID="sign-in-send"
                label={SIGN_IN_COPY.sendCode}
                disabled={!parsedEmail.success}
                loading={isSending}
                onPress={() => {
                  if (parsedEmail.success) void sendCode(parsedEmail.data, false);
                }}
              />
            </View>
          ) : (
            <View className="gap-lg" testID="sign-in-code-step">
              <Text accessibilityRole="header" className="text-2xl font-bold text-text">
                {SIGN_IN_COPY.codeTitle}
              </Text>
              <Text className="text-base text-text-muted">
                {SIGN_IN_COPY.codeIntro(maskEmail(sentEmail))}
              </Text>
              <Input
                testID="sign-in-code"
                label={SIGN_IN_COPY.codeLabel}
                value={code}
                onChangeText={onCodeChange}
                error={error}
                helperText={notice}
                keyboardType="number-pad"
                inputMode="numeric"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
              />
              <Button
                testID="sign-in-verify"
                label={SIGN_IN_COPY.verify}
                disabled={!isCodeComplete || isLockedOut}
                loading={isVerifying}
                onPress={() => void submitCode(code)}
              />
              <Button
                testID="sign-in-resend"
                variant="ghost"
                label={secondsLeft > 0 ? SIGN_IN_COPY.resendIn(secondsLeft) : SIGN_IN_COPY.resend}
                disabled={secondsLeft > 0 || isVerifying}
                loading={isSending}
                onPress={() => void sendCode(sentEmail, true)}
              />
              <Button
                testID="sign-in-change-email"
                variant="ghost"
                label={SIGN_IN_COPY.changeEmail}
                disabled={isVerifying}
                onPress={changeEmail}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
