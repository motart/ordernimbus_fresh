export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-west-2_Pkg0XlCus',
      userPoolClientId: '7fl35kbnh04tbnlhihdgj05qu8',
      signUpVerificationMethod: 'code' as const,
      loginWith: {
        email: true,
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    }
  }
};