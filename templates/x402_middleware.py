"""
x402 Payment Gate Middleware for FastAPI
Injected into every AutoVend-generated service.
Requires callers to pay USDC per call via the x402 protocol.
"""

import os
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

PRICE_USD = float(os.environ.get("PRICE_USD", "0.05"))
WALLET_ID = os.environ.get("WALLET_ID", "")


class X402Middleware(BaseHTTPMiddleware):
    """
    Checks for x402 payment proof in request headers.
    If the caller hasn't paid, returns 402 Payment Required.
    """

    async def dispatch(self, request: Request, call_next):
        # Skip payment check for health endpoint
        if request.url.path == "/health":
            return await call_next(request)

        # Check for x402 payment header
        payment_token = request.headers.get("X-402-Payment")

        if not payment_token:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Payment Required",
                    "price": PRICE_USD,
                    "currency": "USDC",
                    "wallet": WALLET_ID,
                    "protocol": "x402",
                },
            )

        # Verify payment token with Locus
        # In production, this calls Locus API to validate the payment
        # For MVP, we trust the token presence (Locus gateway handles verification)

        response = await call_next(request)
        return response
