from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class JobCreateResponse(BaseModel):
    """Response returned after a print job is successfully created."""
    token: str
    totalCost: int
    amountPaise: int = 0
    razorpayOrderId: Optional[str] = None
    razorpayKeyId: Optional[str] = None
    paymentStatus: str = "pending"
    message: str = "Print job submitted successfully"


class JobFileDetail(BaseModel):
    """Details of a single uploaded file inside a print job."""
    filename: str
    totalPages: int
    colorPages: list[int] = []
    paperSize: str = "A4"
    colorDoubleSided: bool = False
    bwDoubleSided: bool = False
    binding: bool = False
    copies: int = 1
    fileCost: int = 0
    originalFileUrl: Optional[str] = None
    colorFileUrl: Optional[str] = None
    bwFileUrl: Optional[str] = None


class JobDetail(BaseModel):
    """Full job detail returned when admin searches by token or views live queue."""
    token: str
    userEmail: str
    userName: Optional[str] = None
    totalFiles: int = 1
    totalPages: int
    totalCost: int = 0
    status: str = "pending"
    paymentStatus: str = "pending"  # "pending", "paid", "failed"
    razorpayOrderId: Optional[str] = None
    razorpayPaymentId: Optional[str] = None
    paidAt: Optional[datetime] = None
    files: list[JobFileDetail] = []
    # Combined master download links
    combinedColorFileUrl: Optional[str] = None
    combinedBwFileUrl: Optional[str] = None
    createdAt: Optional[datetime] = None


class JobCompleteResponse(BaseModel):
    """Response returned after marking a job as completed."""
    token: str
    status: str = "completed"
    message: str = "Job marked as completed"


class JobCancelResponse(BaseModel):
    """Response returned after cancelling a print job."""
    token: str
    status: str = "cancelled"
    message: str = "Order cancelled successfully"


