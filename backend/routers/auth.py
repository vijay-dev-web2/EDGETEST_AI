from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import User

router = APIRouter()


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": str(current_user.id),
        "github_id": current_user.github_id,
        "username": current_user.username,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "created_at": current_user.created_at,
    }


@router.post("/exchange")
async def exchange_token(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Warm-up endpoint: verifies the Supabase JWT and upserts the user record."""
    return {"user_id": str(current_user.id)}


@router.post("/logout")
async def logout() -> dict:
    return {"message": "logged out"}
