"""HTTP adapter for the existing ESP32 firmware.

The adapter is enabled only when DOTSYNC_DEVICE_MODE=esp32 and DOTSYNC_DEVICE_URL
is set. All ESP32 calls stay on the local FastAPI backend; the browser never calls
the device directly.
"""
import asyncio
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from .base import DeviceStatus, PracticeAction
from .mock import DeviceBusyError


class DeviceConnectionError(Exception):
    """The configured ESP32 could not be reached or rejected a command."""


class ESP32DeviceClient:
    def __init__(self, base_url: str, timeout: float = 3.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._actions: dict[str, PracticeAction] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._active_action_id: str | None = None
        self._lock = asyncio.Lock()

    def _request(self, path: str, method: str = "GET", fields: dict[str, str] | None = None) -> tuple[int, bytes]:
        data = urlencode(fields).encode() if fields is not None else None
        headers = {"Accept": "application/json"}
        if fields is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        request = Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read()
        except HTTPError as error:
            body = error.read()
            if error.code == 409:
                raise DeviceBusyError("The ESP32 is busy. Wait for the current device action to finish.") from error
            raise DeviceConnectionError(f"ESP32 returned HTTP {error.code}.") from error
        except (URLError, TimeoutError, OSError) as error:
            raise DeviceConnectionError("Could not reach the ESP32. Check its power, Wi-Fi, and DOTSYNC_DEVICE_URL.") from error

    async def _request_async(self, path: str, method: str = "GET", fields: dict[str, str] | None = None) -> tuple[int, bytes]:
        return await asyncio.to_thread(self._request, path, method, fields)

    async def get_status(self) -> DeviceStatus:
        try:
            _status, body = await self._request_async("/api/status")
            payload = json.loads(body.decode("utf-8")) if body else {}
            busy = bool(payload.get("busy", False)) if isinstance(payload, dict) else False
            return DeviceStatus(mode="esp32", connected=True, busy=busy, message="Connected to the ESP32 on the local network.")
        except (DeviceConnectionError, DeviceBusyError, ValueError, UnicodeDecodeError) as error:
            return DeviceStatus(mode="esp32", connected=False, busy=self._active_action_id is not None, message=str(error))

    async def start_practice(self, text: str) -> PracticeAction:
        status = await self.get_status()
        if not status.connected:
            raise DeviceConnectionError(status.message)
        async with self._lock:
            if self._active_action_id is not None:
                current = self._actions.get(self._active_action_id)
                if current and current.state in {"queued", "running"}:
                    raise DeviceBusyError("The ESP32 is busy. Wait for the current practice to finish or stop it.")
            action_id = str(uuid4())
            action = PracticeAction(
                action_id=action_id, state="queued", text=text, character_count=len(text),
                current_index=0, message="Practice queued for the ESP32.",
            )
            self._actions[action_id] = action
            self._active_action_id = action_id
            self._tasks[action_id] = asyncio.create_task(self._run_practice(action_id))
            return action

    async def get_action(self, action_id: str) -> PracticeAction | None:
        return self._actions.get(action_id)

    async def cancel_action(self, action_id: str) -> PracticeAction | None:
        action = self._actions.get(action_id)
        if not action or action.state in {"completed", "cancelled", "failed"}:
            return action
        task = self._tasks.get(action_id)
        if task and not task.done():
            task.cancel()
        cancelled = action.model_copy(update={
            "state": "cancelled",
            "message": "Practice stopped. A movement already sent to the physical board may finish.",
        })
        self._actions[action_id] = cancelled
        if self._active_action_id == action_id:
            self._active_action_id = None
        return cancelled

    async def reset(self) -> None:
        for action_id, action in tuple(self._actions.items()):
            if action.state in {"queued", "running"}:
                await self.cancel_action(action_id)
        await self._request_async("/api/pins/reset", method="POST", fields={})

    async def _run_practice(self, action_id: str) -> None:
        action = self._actions[action_id]
        try:
            for index, character in enumerate(action.text, start=1):
                if character != " ":
                    await self._request_async("/api/learn", method="POST", fields={"letter": character})
                current = self._actions[action_id]
                if current.state == "cancelled":
                    return
                self._actions[action_id] = current.model_copy(update={
                    "state": "running", "current_index": index,
                    "current_character": character if character != " " else None,
                    "message": f"ESP32 practice: character {index} of {len(action.text)}.",
                })
                await asyncio.sleep(0.65)
            current = self._actions[action_id]
            self._actions[action_id] = current.model_copy(update={
                "state": "completed", "message": f"ESP32 practice completed {len(action.text)} characters.",
            })
        except asyncio.CancelledError:
            return
        except (DeviceConnectionError, DeviceBusyError) as error:
            current = self._actions[action_id]
            self._actions[action_id] = current.model_copy(update={"state": "failed", "message": str(error)})
        finally:
            if self._active_action_id == action_id:
                self._active_action_id = None
