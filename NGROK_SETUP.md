# Using ngrok for Shopify OAuth Development

If you're having issues with localhost redirect URLs, ngrok provides a public URL for your local server.

## Setup

1. **Install ngrok**:
```bash
brew install ngrok
```

2. **Start your local environment**:
```bash
./scripts/start-local.sh
```

3. **Start ngrok for your API**:
```bash
ngrok http 3001
```

4. **Update your configuration**:
You'll see something like:
```
Forwarding: https://abc123.ngrok.io → http://localhost:3001
```

Update `env.json`:
```json
"ShopifyOAuthFunction": {
  ...
  "SHOPIFY_REDIRECT_URI": "https://abc123.ngrok.io/api/shopify/callback",
  ...
}
```

5. **Add ngrok URL to Shopify**:
Add this to your app's redirect URLs:
```
https://abc123.ngrok.io/api/shopify/callback
```

6. **Restart SAM**:
```bash
./scripts/stop-local.sh
./scripts/start-local.sh
```

## Benefits
- Public HTTPS URL that Shopify can redirect to
- Works around localhost issues
- Great for testing webhooks too

## Note
The ngrok URL changes each time you restart it (unless you have a paid account).