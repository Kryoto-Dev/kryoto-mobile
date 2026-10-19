//! Kryoto Mobile's native side: one command, `net_request`, and the opener.
//!
//! Why the web layer does not just `fetch`: kryo.to's account routes
//! (`/api/account/*`, `/api/desktop/*`, `/api/auth/*`) allow cross-origin calls
//! only from chat.kryo.to, and the PC's LAN server speaks plain HTTP, which a
//! webview on an https origin may not call. Requests made here have neither
//! limit, so they are held to an allowlist instead.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::{Host, Url};

#[derive(Deserialize)]
pub struct NetRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct NetResponse {
    status: u16,
    body: String,
}

/// A debug build's stand-in for kryo.to (a local site, for testing the app end
/// to end), from `KRYO_DEV_API` at build time. Never in a release build.
#[cfg(debug_assertions)]
const DEV_API: Option<&str> = option_env!("KRYO_DEV_API");

/// kryo.to over https, or a PC's Kryoto server on a private IPv4 address.
fn allowed(url: &Url) -> bool {
    let plain = url.username().is_empty() && url.password().is_none();
    #[cfg(debug_assertions)]
    if let Some(dev) = DEV_API.and_then(|d| Url::parse(d).ok()) {
        if plain && url.origin() == dev.origin() {
            return true;
        }
    }
    match url.scheme() {
        "https" => plain && url.host_str() == Some("kryo.to") && url.port().is_none(),
        "http" => plain && matches!(url.host(), Some(Host::Ipv4(ip)) if ip.is_private()) && url.path().starts_with("/v1/"),
        _ => false,
    }
}

#[tauri::command]
async fn net_request(req: NetRequest) -> Result<NetResponse, String> {
    let url = Url::parse(&req.url).ok().filter(allowed).ok_or("Blocked address.")?;
    let host = url.host_str().unwrap_or_default().to_string();
    let method = match req.method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err("Blocked address.".into()),
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.request(method, url);
    for (name, value) in &req.headers {
        request = request.header(name.as_str(), value.as_str());
    }
    if let Some(body) = req.body {
        request = request.body(body);
    }
    let response = request.send().await.map_err(|e| unreachable(&host, &e))?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(NetResponse { status, body })
}

/// A failed request in words a player can act on, not the HTTP library's.
fn unreachable(host: &str, e: &reqwest::Error) -> String {
    let pc = is_pc(host);
    if e.is_timeout() {
        if pc {
            format!("{host} did not answer in time. Check Kryoto Desktop is open and this phone is on the same Wi-Fi.")
        } else {
            format!("{host} did not answer in time. Check your connection.")
        }
    } else if e.is_connect() {
        if pc {
            format!("Could not reach {host}. Check Kryoto Desktop is open, Phone is on in its Settings, and this phone is on the same Wi-Fi.")
        } else {
            format!("Could not reach {host}. Check your connection.")
        }
    } else {
        format!("Could not reach {host}.")
    }
}

/// A PC on this network (an IPv4 address) rather than kryo.to.
fn is_pc(host: &str) -> bool {
    host.parse::<std::net::Ipv4Addr>().is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    builder
        .invoke_handler(tauri::generate_handler![net_request])
        .run(tauri::generate_context!())
        .expect("error while running Kryoto Mobile");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(url: &str) -> bool {
        Url::parse(url).is_ok_and(|u| allowed(&u))
    }

    #[test]
    fn kryo_to_over_https_only() {
        assert!(ok("https://kryo.to/api/auth/me"));
        assert!(!ok("https://kryo.to.evil.com/api/auth/me"));
        assert!(!ok("https://evil.com@kryo.to/x"));
        assert!(!ok("https://chat.kryo.to/x"));
        assert!(!ok("http://kryo.to/api/auth/me"));
    }

    #[test]
    fn the_pc_only_on_a_private_address_under_v1() {
        assert!(ok("http://192.168.1.5:47821/v1/snapshot"));
        assert!(ok("http://10.0.0.2:47822/v1/play"));
        assert!(ok("http://172.16.4.4/v1/stop"));
        assert!(!ok("http://8.8.8.8/v1/x"));
        assert!(!ok("http://172.32.0.1/v1/x"));
        assert!(!ok("http://127.0.0.1:47821/v1/x"));
        assert!(!ok("http://192.168.1.5/other"));
        assert!(!ok("http://192.168.1.5/v1/../other"));
        assert!(!ok("https://192.168.1.5/v1/snapshot"));
        assert!(!ok("http://localhost/v1/x"));
    }
}
