"""
AutoVend — Generated FastAPI Service Template
This is the base template that codegen uses as a reference.
The actual generated code is produced by the AI, but follows this structure.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any

app = FastAPI(
    title="{{SERVICE_NAME}}",
    description="{{SERVICE_DESCRIPTION}}",
    version="1.0.0",
)


class RunInput(BaseModel):
    """Input model — fields are generated based on the API description"""
    pass


class RunOutput(BaseModel):
    """Output model — fields are generated based on the API description"""
    success: bool = True
    data: Any = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run", response_model=RunOutput)
def run(input: RunInput):
    """Main endpoint — logic is generated based on the API description"""
    try:
        # Generated logic goes here
        result = {}
        return RunOutput(success=True, data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
