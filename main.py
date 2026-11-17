import copy
import json
import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).parent
DB_PATH = BASE / "salon.db"
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "change-me")

app = FastAPI(title="Autosalon MVP")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


with db() as c:
    c.execute(
        """create table if not exists leads (
        id integer primary key autoincrement,
        name text, phone text, comment text,
        config text, total integer,
        created text default current_timestamp)"""
    )


def make_part(part_id, name, price, builder_name, glb_file):
    """
    Одна деталь каталога.
    builder_name - заглушка из кода (static/app.js, BUILDERS)
    glb_file     - имя файла в static/models/. Если файл есть, используется он.
    Настройки модели подгоняйте здесь:
      paint - красить деталь в цвет кузова (False - оставить как в файле)
      scale - размер
      pos   - сдвиг [x вперёд, y вверх, z вбок]
      rot   - поворот в радианах (1.571 = 90 градусов)
    """
    return {
        "id": part_id,
        "name": name,
        "price": price,
        "builder": builder_name,
        "glb": "/static/models/" + glb_file,
        "paint": True,
        "scale": 1,
        "pos": [0, 0, 0],
        "rot": [0, 0, 0],
    }


# ---------- Каталог. Чтобы добавить деталь, добавьте строку сюда ----------
CAR = {
    "id": "impreza",
    "name": "Subaru Impreza",
    "base_price": 24000,
    "categories": [
        {"id": "spoiler", "title": "Спойлер", "options": [
            {"id": "none", "name": "Без спойлера", "price": 0},
            make_part("lip", "Лип-спойлер", 250, "spoiler_lip", "spoiler_lip.glb"),
            make_part("ducktail", "Утиный хвост", 420, "spoiler_ducktail", "spoiler_ducktail.glb"),
            make_part("gt", "GT-крыло", 890, "spoiler_gt", "spoiler_gt.glb"),
        ]},
        {"id": "hood", "title": "Капот", "options": [
            {"id": "stock", "name": "Стандартный", "price": 0},
            make_part("scoop", "Воздухозаборник", 540, "hood_scoop", "hood_scoop.glb"),
            make_part("vents", "Жабры", 380, "hood_vents", "hood_vents.glb"),
            make_part("carbon", "Карбоновый капот", 1900, "hood_carbon", "hood_carbon.glb"),
        ]},
        {"id": "bumper", "title": "Передний бампер", "options": [
            {"id": "stock", "name": "Стандартный", "price": 0},
            make_part("sport", "Спорт-сплиттер", 650, "bumper_sport", "bumper_sport.glb"),
            make_part("aggressive", "Агрессивный обвес", 1250, "bumper_aggressive", "bumper_aggressive.glb"),
        ]},
        {"id": "skirts", "title": "Пороги", "options": [
            {"id": "stock", "name": "Стандартные", "price": 0},
            make_part("paint", "Под цвет кузова", 400, "skirts_paint", "skirts_paint.glb"),
            make_part("carbon", "Карбон", 780, "skirts_carbon", "skirts_carbon.glb"),
        ]},
        {"id": "wheels", "title": "Диски", "options": [
            {"id": "silver", "name": "Серебро, 5 спиц", "price": 0, "builder": "wheels", "params": {"color": "#b9bec4", "spokes": 5}},
            {"id": "black", "name": "Чёрные, 5 спиц", "price": 700, "builder": "wheels", "params": {"color": "#16181b", "spokes": 5}},
            {"id": "gold", "name": "Золото, 10 спиц", "price": 1100, "builder": "wheels", "params": {"color": "#c9a24a", "spokes": 10}},
        ]},
    ],
    "colors": [
        {"id": "wr_blue", "name": "WR Blue", "hex": "#1b3fa0"},
        {"id": "white", "name": "Белый", "hex": "#f1f2f3"},
        {"id": "black", "name": "Чёрный", "hex": "#0f1113"},
        {"id": "red", "name": "Красный", "hex": "#b3202a"},
        {"id": "yellow", "name": "Жёлтый", "hex": "#e8b923"},
        {"id": "silver", "name": "Серебро", "hex": "#a9afb5"},
    ],
}

INVENTORY = [
    {"name": "Subaru Impreza 2.0 AWD", "year": 2023, "km": 12000, "price": 24000},
    {"name": "Subaru Impreza WRX STI", "year": 2019, "km": 48000, "price": 31500},
    {"name": "Subaru Impreza Sport", "year": 2022, "km": 21000, "price": 22800},
]

GLB_FIELDS = ["glb", "paint", "scale", "pos", "rot"]


def build_catalog_for_site():
    """
    Делает копию каталога для сайта.
    Если файл .glb лежит в static/models/, оставляем модель и убираем заглушку.
    Если файла нет, оставляем заглушку и убираем поля модели.
    """
    catalog_copy = copy.deepcopy(CAR)
    for category in catalog_copy["categories"]:
        for option in category["options"]:
            if "glb" not in option:
                continue
            relative_path = option["glb"].lstrip("/")
            glb_exists = (BASE / relative_path).is_file()
            if glb_exists:
                option.pop("builder", None)
            else:
                for field_name in GLB_FIELDS:
                    option.pop(field_name, None)
    return catalog_copy


def calc_total(config):
    total = CAR["base_price"]
    for category in CAR["categories"]:
        option_id = config.get(category["id"], category["options"][0]["id"])
        found_option = None
        for option in category["options"]:
            if option["id"] == option_id:
                found_option = option
                break
        if found_option is None:
            raise HTTPException(422, "Неизвестная опция " + category["id"] + "=" + option_id)
        total += found_option["price"]
    return total


class Lead(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=5, max_length=30)
    comment: str = Field("", max_length=500)
    config: dict[str, str]


@app.get("/api/catalog")
def catalog():
    return build_catalog_for_site()


@app.get("/api/inventory")
def inventory():
    return INVENTORY


@app.post("/api/leads")
def create_lead(lead: Lead):
    total = calc_total(lead.config)  # цену считаем на сервере, клиенту не верим
    with db() as c:
        c.execute(
            "insert into leads (name, phone, comment, config, total) values (?,?,?,?,?)",
            (lead.name, lead.phone, lead.comment, json.dumps(lead.config), total),
        )
    return {"ok": True, "total": total}


@app.get("/api/leads")
def list_leads(x_admin_token: str = Header("")):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(401, "Нужен заголовок X-Admin-Token")
    with db() as c:
        return [dict(r) for r in c.execute("select * from leads order by id desc")]


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")