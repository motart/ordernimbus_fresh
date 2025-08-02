const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { cognitoClient } = require('../config/cognito');
const { dynamoDb } = require('../config/database');
const { 
  InitiateAuthCommand, 
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      tenantId: user.tenantId,
      role: user.role 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (process.env.USE_COGNITO === 'true') {
    // Cognito authentication
    const authCommand = new InitiateAuthCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    try {
      const response = await cognitoClient.send(authCommand);
      
      res.json({
        success: true,
        data: {
          accessToken: response.AuthenticationResult.AccessToken,
          refreshToken: response.AuthenticationResult.RefreshToken,
          idToken: response.AuthenticationResult.IdToken,
          expiresIn: response.AuthenticationResult.ExpiresIn
        }
      });
    } catch (error) {
      throw ApiError.unauthorized('Invalid credentials');
    }
  } else {
    // Local authentication (for development)
    const getUserCommand = new GetCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email }
    });

    const { Item: user } = await dynamoDb.send(getUserCommand);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const tokens = generateTokens(user);

    // Store refresh token
    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email },
      UpdateExpression: 'SET refreshToken = :token, lastLogin = :now',
      ExpressionAttributeValues: {
        ':token': tokens.refreshToken,
        ':now': new Date().toISOString()
      }
    });

    await dynamoDb.send(updateCommand);

    res.json({
      success: true,
      data: {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId
        }
      }
    });
  }
});

const register = asyncHandler(async (req, res) => {
  const { email, password, name, organizationName } = req.body;

  if (process.env.USE_COGNITO === 'true') {
    // Cognito registration
    const signUpCommand = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name || email.split('@')[0] }
      ]
    });

    try {
      const response = await cognitoClient.send(signUpCommand);
      
      // Store additional user data in DynamoDB
      const tenantId = crypto.randomUUID();
      const userCommand = new PutCommand({
        TableName: process.env.USERS_TABLE || 'ordernimbus-users',
        Item: {
          id: response.UserSub,
          email,
          name: name || email.split('@')[0],
          organizationName,
          tenantId,
          role: 'admin',
          createdAt: new Date().toISOString(),
          status: 'pending_confirmation'
        }
      });

      await dynamoDb.send(userCommand);

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email for confirmation.',
        data: {
          userId: response.UserSub,
          email,
          tenantId
        }
      });
    } catch (error) {
      if (error.name === 'UsernameExistsException') {
        throw ApiError.conflict('User already exists');
      }
      throw error;
    }
  } else {
    // Local registration (for development)
    const getUserCommand = new GetCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email }
    });

    const { Item: existingUser } = await dynamoDb.send(getUserCommand);

    if (existingUser) {
      throw ApiError.conflict('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();

    const createUserCommand = new PutCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Item: {
        id: userId,
        email,
        passwordHash,
        name: name || email.split('@')[0],
        organizationName,
        tenantId,
        role: 'admin',
        createdAt: new Date().toISOString(),
        status: 'active'
      }
    });

    await dynamoDb.send(createUserCommand);

    const tokens = generateTokens({ id: userId, email, tenantId, role: 'admin' });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        ...tokens,
        user: {
          id: userId,
          email,
          name: name || email.split('@')[0],
          tenantId,
          role: 'admin'
        }
      }
    });
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (process.env.USE_COGNITO === 'true') {
    // Cognito password reset
    const forgotPasswordCommand = new ForgotPasswordCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email
    });

    try {
      await cognitoClient.send(forgotPasswordCommand);
      res.json({
        success: true,
        message: 'Password reset code sent to your email'
      });
    } catch (error) {
      // Don't reveal if user exists or not
      res.json({
        success: true,
        message: 'If the email exists, a password reset code has been sent'
      });
    }
  } else {
    // Local password reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email },
      UpdateExpression: 'SET resetToken = :token, resetTokenExpiry = :expiry',
      ExpressionAttributeValues: {
        ':token': resetToken,
        ':expiry': resetTokenExpiry
      },
      ConditionExpression: 'attribute_exists(email)'
    });

    try {
      await dynamoDb.send(updateCommand);
      
      // In production, send email with reset link
      // For now, just return the token (development only)
      res.json({
        success: true,
        message: 'Password reset token generated',
        ...(process.env.NODE_ENV === 'development' && { resetToken })
      });
    } catch (error) {
      // Don't reveal if user exists or not
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }
  }
});

const changePassword = asyncHandler(async (req, res) => {
  const { token, newPassword, confirmationCode } = req.body;

  if (process.env.USE_COGNITO === 'true' && confirmationCode) {
    // Cognito password change with confirmation code
    const confirmCommand = new ConfirmForgotPasswordCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: req.body.email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    });

    try {
      await cognitoClient.send(confirmCommand);
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      throw ApiError.badRequest('Invalid or expired confirmation code');
    }
  } else {
    // Local password change with token
    const getUserCommand = new GetCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email: req.body.email }
    });

    const { Item: user } = await dynamoDb.send(getUserCommand);

    if (!user || user.resetToken !== token) {
      throw ApiError.badRequest('Invalid or expired reset token');
    }

    if (new Date(user.resetTokenExpiry) < new Date()) {
      throw ApiError.badRequest('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { email: req.body.email },
      UpdateExpression: 'SET passwordHash = :hash REMOVE resetToken, resetTokenExpiry',
      ExpressionAttributeValues: {
        ':hash': passwordHash
      }
    });

    await dynamoDb.send(updateCommand);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  }
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret'
    );

    const getUserCommand = new GetCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { id: decoded.id }
    });

    const { Item: user } = await dynamoDb.send(getUserCommand);

    if (!user || user.refreshToken !== refreshToken) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const tokens = generateTokens(user);

    // Update refresh token
    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { id: user.id },
      UpdateExpression: 'SET refreshToken = :token',
      ExpressionAttributeValues: {
        ':token': tokens.refreshToken
      }
    });

    await dynamoDb.send(updateCommand);

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
});

const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    // Clear refresh token
    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE || 'ordernimbus-users',
      Key: { id: req.user.id },
      UpdateExpression: 'REMOVE refreshToken'
    });

    await dynamoDb.send(updateCommand);
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = {
  login,
  register,
  resetPassword,
  changePassword,
  refreshToken,
  logout
};