# =====================================================================
# extensions.py  (backend Flask)
# Instancia única de la base de datos. Los blueprints la importan así:
#     from extensions import db
# =====================================================================
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
