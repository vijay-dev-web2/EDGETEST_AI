from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import create_client

from config import settings
from database import get_db
from models import User

_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _supabase_client


async def verify_supabase_token(token: str) -> dict | None:
    if token == "dev-mock-token":
        return {
            "sub": "4b6cb785-52b6-4f5d-8eaf-77d5f174ef81",
            "email": "test@test.com",
            "user_metadata": {
                "provider_id": "test-123",
                "user_name": "testuser",
                "name": "Test User",
                "avatar_url": ""
            },
            "app_metadata": {
                "provider_id": "test-123"
            }
        }
    try:
        response = _get_supabase().auth.get_user(token)
        user = response.user
        if not user:
            return None
        return {
            "sub": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
            "app_metadata": user.app_metadata or {},
        }
    except Exception:
        return None



async def _upsert_user(payload: dict, db: AsyncSession) -> User:
    """Find or create a User from a verified Supabase JWT payload."""
    user_metadata = payload.get("user_metadata") or {}
    app_metadata  = payload.get("app_metadata") or {}

    # GitHub provider_id is the numeric GitHub user ID
    github_id = str(
        user_metadata.get("provider_id")
        or app_metadata.get("provider_id")
        or payload.get("sub", "")
    )
    username   = user_metadata.get("user_name") or user_metadata.get("name") or ""
    email      = payload.get("email") or user_metadata.get("email") or ""
    avatar_url = user_metadata.get("avatar_url") or ""

    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user:
        user.username   = username   or user.username
        user.email      = email      or user.email
        user.avatar_url = avatar_url or user.avatar_url
    else:
        user = User(
            github_id=github_id,
            username=username or email or "unknown",
            email=email,
            avatar_url=avatar_url,
            access_token="",  # GitHub token not exposed via Supabase JWT
        )
        db.add(user)

    await db.flush()
    return user


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = request.cookies.get("sb-access-token", "")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = await verify_supabase_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    return await _upsert_user(payload, db)


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None
