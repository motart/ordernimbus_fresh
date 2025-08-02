const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const ses = new SESClient({ region: 'us-west-1' });
const crypto = require('crypto');

exports.handler = async (event) => {
    console.log('Password reset request:', JSON.stringify(event));
    
    // Parse the request
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        body = event;
    }
    
    const email = body.email;
    
    if (!email) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Email is required' })
        };
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetLink = `https://app.ordernimbus.com/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    // Email parameters
    const params = {
        Source: 'noreply@ordernimbus.com',
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Subject: {
                Data: 'Reset Your OrderNimbus Password',
                Charset: 'UTF-8'
            },
            Body: {
                Html: {
                    Data: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <style>
                                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                                .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h1>OrderNimbus</h1>
                                    <p>Password Reset Request</p>
                                </div>
                                <div class="content">
                                    <h2>Hello,</h2>
                                    <p>We received a request to reset the password for your OrderNimbus account associated with ${email}.</p>
                                    <p>Click the button below to reset your password:</p>
                                    <div style="text-align: center;">
                                        <a href="${resetLink}" class="button">Reset Password</a>
                                    </div>
                                    <p>Or copy and paste this link into your browser:</p>
                                    <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">${resetLink}</p>
                                    <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
                                    <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                                    <div class="footer">
                                        <p>© 2025 OrderNimbus - AI-Powered Sales Forecasting</p>
                                        <p>This is an automated message, please do not reply.</p>
                                    </div>
                                </div>
                            </div>
                        </body>
                        </html>
                    `,
                    Charset: 'UTF-8'
                },
                Text: {
                    Data: `
Hello,

We received a request to reset the password for your OrderNimbus account associated with ${email}.

Click the link below to reset your password:
${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email or contact support if you have concerns.

Best regards,
The OrderNimbus Team
                    `,
                    Charset: 'UTF-8'
                }
            }
        }
    };
    
    try {
        const command = new SendEmailCommand(params);
        await ses.send(command);
        
        // In production, save the token to DynamoDB with expiration
        // For now, just log it
        console.log(`Password reset token generated for ${email}: ${resetToken}`);
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: true, 
                message: 'Password reset email sent successfully' 
            })
        };
    } catch (error) {
        console.error('Error sending email:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Failed to send password reset email',
                details: error.message 
            })
        };
    }
};