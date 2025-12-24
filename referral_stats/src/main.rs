use hmac::{Hmac, Mac};
use reqwest::Client;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

const ENDPOINT: &str = "https://api.boltz.exchange";

async fn send_authenticated_request(
    client: &Client,
    path: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    // Get current Unix timestamp in seconds
    let ts = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    let api_key = std::env::var("API_KEY").expect("API_KEY is not set");
    let api_secret = std::env::var("API_SECRET").expect("API_SECRET is not set");

    // Create HMAC signature: timestamp + method + path
    let mut mac = Hmac::<Sha256>::new_from_slice(api_secret.as_bytes())?;
    mac.update(format!("{}GET{}", ts, path).as_bytes());
    let hmac = hex::encode(mac.finalize().into_bytes());

    // Send request with authentication headers
    let response = client
        .get(format!("{}{}", ENDPOINT, path))
        .header("TS", ts.to_string())
        .header("API-KEY", api_key)
        .header("API-HMAC", hmac)
        .send()
        .await?;

    let json: serde_json::Value = response.json().await?;
    Ok(json)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();

    // Example: Query referral stats
    let response = send_authenticated_request(&client, "/v2/referral/stats").await?;
    println!("{}", serde_json::to_string_pretty(&response)?);

    Ok(())
}
