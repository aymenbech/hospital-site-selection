from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx

from app.config import settings
from app.database import SessionLocal
from app.models.profile import Profile


class SupabaseUser(BaseModel):
    id: str
    email: str


async def get_current_user_from_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())
) -> Profile:
    token = credentials.credentials
    
    print(f"=== TOKEN RECEIVED: {token[:50]}...")  # أول 50 حرف فقط
    print(f"=== SUPABASE_URL: {settings.supabase_url}")
    print(f"=== SUPABASE_KEY: {settings.supabase_key[:50]}...")

    try:
        async with httpx.AsyncClient() as client:
            print(f"=== Calling: {settings.supabase_url}/auth/v1/user")
            
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_key,
                },
                timeout=10.0,
            )

            print(f"=== Response Status: {response.status_code}")
            print(f"=== Response Body: {response.text}")

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid or expired token: {response.status_code} - {response.text}",
                )


            user_data = response.json()
            user_id = user_data.get("id")

            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: no user ID",
                )

            # Get or create profile in database
            db = SessionLocal()
            try:
                profile = db.query(Profile).filter(Profile.id == user_id).first()

                if not profile:
                    # Create new profile for this user
                    profile = Profile(
                        id=user_id,
                        full_name=user_data.get("user_metadata", {}).get("full_name", ""),
                        role="analyst",
                    )
                    db.add(profile)
                    db.commit()
                    db.refresh(profile)

                return profile
            finally:
                db.close()

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication service error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication error: {str(e)}",
        )