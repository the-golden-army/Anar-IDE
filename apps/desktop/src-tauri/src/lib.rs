use anar_core::CompilerBackend;

/// Returns the default compiler backend configured in `anar-core`.
pub fn default_backend() -> CompilerBackend {
    CompilerBackend::default()
}

/// Entry point for the Anar desktop application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Anar");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_backend_is_cargo() {
        assert_eq!(default_backend(), CompilerBackend::Cargo);
    }
}
