"""Cliente de validación para Python 3.10+. Solo biblioteca estándar.

El programa consumidor permite el uso únicamente si resultado['valida'] es True.
Los errores de conexión no autorizan el acceso; deben tratarse explícitamente.
"""
import json
from urllib.request import Request, urlopen


def validar_licencia(supabase_url: str, clave_publica: str, codigo_app: str,
                    licencia: str, hardware_id: str) -> dict:
    request = Request(
        f"{supabase_url.rstrip('/')}/rest/v1/rpc/validar_licencia",
        data=json.dumps({
            "p_codigo_app": codigo_app,
            "p_clave": licencia.strip(),
            "p_hardware_id": hardware_id,
        }).encode("utf-8"),
        headers={"apikey": clave_publica, "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        result = json.load(response)
    if not isinstance(result, dict) or type(result.get("valida")) is not bool:
        raise ValueError("Respuesta de validación inválida")
    return result
