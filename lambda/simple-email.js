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
    
    // For demo purposes, we'll log the reset request and return success
    const resetToken = Math.random().toString(36).substring(2, 15);
    const resetLink = `https://app.ordernimbus.com/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    
    console.log(`Password reset requested for: ${email}`);
    console.log(`Reset link would be: ${resetLink}`);
    
    // In a production environment, you would:
    // 1. Store the token in DynamoDB with expiration
    // 2. Send actual email via SES
    // 3. Implement the reset password page
    
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            success: true, 
            message: 'Password reset instructions have been sent to your email.',
            debug: {
                note: 'Email service is in demo mode. In production, an email would be sent to ' + email,
                resetLink: resetLink
            }
        })
    };
};