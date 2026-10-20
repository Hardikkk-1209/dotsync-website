from typing import Literal, Protocol

from pydantic import BaseModel


class DeviceStatus(BaseModel):
    mode: Literal["mock", "esp32"]
    connected: bool
    busy: bool
    message: str


class PracticeAction(BaseModel):
    action_id: str
    state: Literal["queued", "running", "completed", "cancelled", "failed"]
    text: str
    character_count: int
    current_index: int
    current_character: str | None = None
    message: str


class DeviceClient(Protocol):
    async def get_status(self) -> DeviceStatus: ...

    async def start_practice(self, text: str) -> PracticeAction: ...

    async def get_action(self, action_id: str) -> PracticeAction | None: ...

    async def cancel_action(self, action_id: str) -> PracticeAction | None: ...

    async def reset(self) -> None: ...
