import os

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .device.base import DeviceStatus, PracticeAction
from .device.mock import DeviceBusyError, MockDeviceClient
from .device.esp32 import DeviceConnectionError, ESP32DeviceClient
from .lessons import WordSessionStore, WordSessionView
from .schemas import HealthResponse, PracticeRequest, WordAnswerRequest, WordSessionRequest

app = FastAPI(
    title="DotSync Local API",
    version="0.1.0",
    description="Local Braille learning API with safe mock mode and optional ESP32 adapter.",
)
device_mode = os.getenv("DOTSYNC_DEVICE_MODE", "mock").strip().lower()
if device_mode == "esp32":
    device = ESP32DeviceClient(os.getenv("DOTSYNC_DEVICE_URL", "http://192.168.4.1"))
else:
    device = MockDeviceClient()
word_sessions = WordSessionStore()


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, error: RequestValidationError
) -> JSONResponse:
    text_field_error = any(
        validation_error.get("loc", ())[-1:] == ("text",)
        for validation_error in error.errors()
    )
    word_field_error = any(
        validation_error.get("loc", ())[-1:] == ("word",)
        for validation_error in error.errors()
    )
    if text_field_error:
        return JSONResponse(
            status_code=422,
            content={
                "code": "UNSUPPORTED_INPUT",
                "message": "Use 1–40 English letters A-Z and spaces only.",
            },
        )
    if word_field_error:
        return JSONResponse(
            status_code=422,
            content={
                "code": "UNSUPPORTED_INPUT",
                "message": "Choose a word with 2-8 English letters A-Z and no spaces.",
            },
        )
    return JSONResponse(
        status_code=422,
        content={"code": "INVALID_REQUEST", "message": "Check the request and try again."},
    )


@app.get("/api/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/v1/device/status", response_model=DeviceStatus)
async def device_status() -> DeviceStatus:
    return await device.get_status()


@app.post(
    "/api/v1/practice",
    response_model=PracticeAction,
    status_code=status.HTTP_202_ACCEPTED,
)
async def practice(request: PracticeRequest) -> PracticeAction:
    try:
        return await device.start_practice(request.text)
    except DeviceConnectionError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "DEVICE_OFFLINE", "message": str(error)},
        ) from error
    except DeviceBusyError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DEVICE_BUSY", "message": str(error)},
        ) from error


@app.get("/api/v1/actions/{action_id}", response_model=PracticeAction)
async def action_status(action_id: str) -> PracticeAction:
    action = await device.get_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Practice activity not found.")
    return action


@app.post("/api/v1/actions/{action_id}/cancel", response_model=PracticeAction)
async def cancel_action(action_id: str) -> PracticeAction:
    action = await device.cancel_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Practice activity not found.")
    return action


@app.post("/api/v1/device/reset", response_model=DeviceStatus)
async def reset_device() -> DeviceStatus:
    try:
        await device.reset()
        return await device.get_status()
    except DeviceConnectionError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "DEVICE_OFFLINE", "message": str(error)},
        ) from error


@app.post("/api/v1/sessions", response_model=WordSessionView, status_code=status.HTTP_201_CREATED)
async def create_word_session(request: WordSessionRequest) -> WordSessionView:
    return word_sessions.create(request.word)


@app.get("/api/v1/sessions/{session_id}", response_model=WordSessionView)
async def get_word_session(session_id: str) -> WordSessionView:
    session = word_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Word journey not found."})
    return session


@app.post("/api/v1/sessions/{session_id}/advance", response_model=WordSessionView)
async def advance_word_session(session_id: str) -> WordSessionView:
    session = word_sessions.advance(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Word journey not found."})
    return session


@app.post("/api/v1/sessions/{session_id}/evaluate", response_model=WordSessionView)
async def evaluate_word_session(session_id: str, request: WordAnswerRequest) -> WordSessionView:
    session = word_sessions.evaluate(session_id, request.answer)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Word journey not found."})
    return session


@app.post("/api/v1/sessions/{session_id}/cancel", response_model=WordSessionView)
async def cancel_word_session(session_id: str) -> WordSessionView:
    session = word_sessions.cancel(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Word journey not found."})
    return session
