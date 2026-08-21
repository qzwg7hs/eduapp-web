import uuid, os, boto3
from pathlib import Path
from fastapi import UploadFile
from dotenv import load_dotenv

load_dotenv()

r2 = boto3.client(
    "s3",
    endpoint_url = f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
    aws_access_key_id = os.getenv("R2_ACCESS_KEY"),
    aws_secret_access_key = os.getenv("R2_SECRET_KEY"),
    region_name = "auto",
)

BUCKET = os.getenv("R2_BUCKET")
PUBLIC_URL = os.getenv("PUBLIC_URL") or os.getenv("R2_PUBLIC_URL", "")


def upload_file(file: UploadFile, folder: str = '') -> str:
    """Upload any UploadFile to R2 under the given folder prefix."""
    ext = Path(file.filename or 'file').suffix
    key = f"{folder}{uuid.uuid4()}{ext}"
    contents = file.file.read()
    r2.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=contents,
        ContentType=file.content_type or 'application/octet-stream',
    )
    return f"{PUBLIC_URL}/{key}"


def upload_file_bytes(content: bytes, filename: str, folder: str = '', content_type: str = 'application/octet-stream') -> str:
    """Upload raw bytes to R2 (use when the bytes must be read before uploading)."""
    ext = Path(filename).suffix
    key = f"{folder}{uuid.uuid4()}{ext}"
    r2.put_object(Bucket=BUCKET, Key=key, Body=content, ContentType=content_type)
    return f"{PUBLIC_URL}/{key}"


def upload_image(file: UploadFile) -> str:
    return upload_file(file, folder='images/')
