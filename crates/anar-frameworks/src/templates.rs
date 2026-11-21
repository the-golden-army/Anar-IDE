//! Project scaffolding templates for standard Rust and supported frameworks.

use anar_core::FrameworkKind;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Supported starter project templates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectTemplateId {
    Binary,
    Library,
    Axum,
    ActixWeb,
    Rocket,
    Dioxus,
    Leptos,
    Yew,
    Tauri,
    Bevy,
    Clap,
}

/// UI metadata describing one project template.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTemplateSummary {
    pub id: ProjectTemplateId,
    pub name: String,
    pub description: String,
    pub category: String,
    pub framework: Option<FrameworkKind>,
}

/// Returns all built-in project templates in display order.
pub fn list_project_templates() -> Vec<ProjectTemplateSummary> {
    vec![
        ProjectTemplateSummary {
            id: ProjectTemplateId::Binary,
            name: "Rust Binary (bin)".to_string(),
            description: "Minimal executable crate with `src/main.rs`.".to_string(),
            category: "Standard".to_string(),
            framework: None,
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Library,
            name: "Rust Library (lib)".to_string(),
            description: "Library crate with unit tests in `src/lib.rs`.".to_string(),
            category: "Standard".to_string(),
            framework: None,
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Axum,
            name: "Axum Web API".to_string(),
            description: "Async HTTP API with Axum + Tokio listening on port 3000.".to_string(),
            category: "Web API".to_string(),
            framework: Some(FrameworkKind::Axum),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::ActixWeb,
            name: "Actix Web API".to_string(),
            description: "HTTP service using Actix Web on port 8080.".to_string(),
            category: "Web API".to_string(),
            framework: Some(FrameworkKind::ActixWeb),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Rocket,
            name: "Rocket Web App".to_string(),
            description: "Rocket 0.5 HTTP server with `#[get]` routes.".to_string(),
            category: "Web API".to_string(),
            framework: Some(FrameworkKind::Rocket),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Dioxus,
            name: "Dioxus App".to_string(),
            description: "Reactive Dioxus UI starter ready for `dx serve`.".to_string(),
            category: "Web / UI".to_string(),
            framework: Some(FrameworkKind::Dioxus),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Leptos,
            name: "Leptos Web App".to_string(),
            description: "Fine-grained reactive Leptos CSR starter.".to_string(),
            category: "Web / UI".to_string(),
            framework: Some(FrameworkKind::Leptos),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Yew,
            name: "Yew WASM App".to_string(),
            description: "Yew component app with `index.html` for Trunk.".to_string(),
            category: "Web / UI".to_string(),
            framework: Some(FrameworkKind::Yew),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Tauri,
            name: "Tauri Desktop App".to_string(),
            description: "Tauri v2 desktop app (`src-tauri` + static `src/`).".to_string(),
            category: "Desktop".to_string(),
            framework: Some(FrameworkKind::Tauri),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Bevy,
            name: "Bevy Game App".to_string(),
            description: "ECS starter app using Bevy `DefaultPlugins`.".to_string(),
            category: "Game".to_string(),
            framework: Some(FrameworkKind::Bevy),
        },
        ProjectTemplateSummary {
            id: ProjectTemplateId::Clap,
            name: "Clap CLI Tool".to_string(),
            description: "Command-line parser with `clap` derive macros.".to_string(),
            category: "CLI".to_string(),
            framework: Some(FrameworkKind::Clap),
        },
    ]
}

/// Validates a Cargo crate directory name (`[A-Za-z0-9][A-Za-z0-9_-]*`).
pub fn validate_project_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("Project name must be between 1 and 64 characters.".to_string());
    }
    let bytes = name.as_bytes();
    if !bytes[0].is_ascii_alphanumeric() {
        return Err("Project name must start with an ASCII letter or digit.".to_string());
    }
    for &b in bytes {
        if !(b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err("Project name may only contain letters, digits, '-' or '_'.".to_string());
        }
    }
    Ok(())
}

/// Scaffolds a new Cargo project under `parent_dir/<project_name>`.
pub fn scaffold_project(
    parent_dir: &Path,
    project_name: &str,
    template: ProjectTemplateId,
) -> Result<PathBuf, String> {
    validate_project_name(project_name)?;
    if !parent_dir.is_dir() {
        return Err(format!(
            "parent directory does not exist: {}",
            parent_dir.display()
        ));
    }

    let target_dir = parent_dir.join(project_name);
    if target_dir.exists() {
        return Err(format!(
            "destination already exists: {}",
            target_dir.display()
        ));
    }

    let files = build_template_files(project_name, template);
    if let Err(err) = fs::create_dir_all(&target_dir) {
        return Err(format!("failed to create project directory: {err}"));
    }

    for (rel_path, content) in files {
        let full_path = target_dir.join(&rel_path);
        if let Some(parent) = full_path.parent() {
            if let Err(err) = fs::create_dir_all(parent) {
                return Err(format!("failed to create directory: {err}"));
            }
        }
        if let Err(err) = fs::write(&full_path, content) {
            return Err(format!("failed to write `{rel_path}`: {err}"));
        }
    }

    Ok(target_dir)
}

fn build_template_files(
    project_name: &str,
    template: ProjectTemplateId,
) -> Vec<(String, String)> {
    let crate_ident = project_name.replace('-', "_");
    let gitignore = "/target\nCargo.lock\n".to_string();

    match template {
        ProjectTemplateId::Binary => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                format!(
                    "fn main() {{\n    println!(\"Hello from {project_name}!\");\n}}\n"
                ),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Library => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\n"
                ),
            ),
            (
                "src/lib.rs".to_string(),
                "pub fn add(left: u64, right: u64) -> u64 {\n    left + right\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn it_works() {\n        assert_eq!(add(2, 2), 4);\n    }\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Axum => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\naxum = \"0.7\"\ntokio = {{ version = \"1\", features = [\"full\"] }}\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "use axum::{routing::get, Router};\n\nasync fn index() -> &'static str {\n    \"Hello from Axum!\"\n}\n\nasync fn health() -> &'static str {\n    \"ok\"\n}\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new()\n        .route(\"/\", get(index))\n        .route(\"/health\", get(health));\n    let listener = tokio::net::TcpListener::bind(\"127.0.0.1:3000\")\n        .await\n        .expect(\"failed to bind port 3000\");\n    println!(\"listening on http://127.0.0.1:3000\");\n    axum::serve(listener, app).await.expect(\"server failed\");\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::ActixWeb => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nactix-web = \"4\"\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "use actix_web::{get, App, HttpResponse, HttpServer, Responder};\n\n#[get(\"/\")]\nasync fn index() -> impl Responder {\n    HttpResponse::Ok().body(\"Hello from Actix Web!\")\n}\n\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    println!(\"starting service on http://127.0.0.1:8080\");\n    HttpServer::new(|| App::new().service(index))\n        .bind((\"127.0.0.1\", 8080))?\n        .run()\n        .await\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Rocket => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nrocket = \"0.5\"\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "#[macro_use]\nextern crate rocket;\n\n#[get(\"/\")]\nfn index() -> &'static str {\n    \"Hello from Rocket!\"\n}\n\n#[launch]\nfn rocket() -> _ {\n    rocket::build().mount(\"/\", routes![index])\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Dioxus => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\ndioxus = {{ version = \"0.5\", features = [\"web\"] }}\n"
                ),
            ),
            (
                "Dioxus.toml".to_string(),
                format!("[application]\nname = \"{project_name}\"\n"),
            ),
            (
                "src/main.rs".to_string(),
                "use dioxus::prelude::*;\n\nfn main() {\n    launch(App);\n}\n\n#[component]\nfn App() -> Element {\n    let mut count = use_signal(|| 0);\n    rsx! {\n        main {\n            h1 { \"Hello from Dioxus\" }\n            button { onclick: move |_| count += 1, \"Count: {count}\" }\n        }\n    }\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Leptos => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nleptos = {{ version = \"0.6\", features = [\"csr\"] }}\n"
                ),
            ),
            (
                "index.html".to_string(),
                format!(
                    "<!DOCTYPE html>\n<html>\n  <head><meta charset=\"utf-8\" /><title>{project_name}</title></head>\n  <body></body>\n</html>\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "use leptos::*;\n\n#[component]\nfn App() -> impl IntoView {\n    let (count, set_count) = create_signal(0);\n    view! {\n        <button on:click=move |_| set_count.update(|n| *n += 1)>\n            \"Count: \" {count}\n        </button>\n    }\n}\n\nfn main() {\n    mount_to_body(App);\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Yew => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nyew = {{ version = \"0.21\", features = [\"csr\"] }}\n"
                ),
            ),
            (
                "index.html".to_string(),
                format!(
                    "<!DOCTYPE html>\n<html>\n  <head><meta charset=\"utf-8\" /><title>{project_name}</title></head>\n  <body></body>\n</html>\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "use yew::prelude::*;\n\n#[function_component(App)]\nfn app() -> Html {\n    let counter = use_state(|| 0);\n    let onclick = {\n        let counter = counter.clone();\n        move |_| counter.set(*counter + 1)\n    };\n    html! {\n        <div>\n            <button {onclick}>{ format!(\"Count: {}\", *counter) }</button>\n        </div>\n    }\n}\n\nfn main() {\n    yew::Renderer::<App>::new().render();\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Tauri => vec![
            (
                "src/index.html".to_string(),
                format!(
                    "<!DOCTYPE html>\n<html>\n  <head><meta charset=\"utf-8\" /><title>{project_name}</title></head>\n  <body><h1>{project_name}</h1></body>\n</html>\n"
                ),
            ),
            (
                "src-tauri/Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[build-dependencies]\ntauri-build = {{ version = \"2\", features = [] }}\n\n[dependencies]\ntauri = {{ version = \"2\", features = [] }}\nserde = {{ version = \"1\", features = [\"derive\"] }}\nserde_json = \"1\"\n"
                ),
            ),
            (
                "src-tauri/build.rs".to_string(),
                "fn main() {\n    tauri_build::build();\n}\n".to_string(),
            ),
            (
                "src-tauri/tauri.conf.json".to_string(),
                format!(
                    "{{\n  \"productName\": \"{project_name}\",\n  \"version\": \"0.1.0\",\n  \"identifier\": \"com.anar.{crate_ident}\",\n  \"build\": {{\n    \"frontendDist\": \"../src\"\n  }},\n  \"app\": {{\n    \"windows\": [\n      {{\n        \"title\": \"{project_name}\",\n        \"width\": 960,\n        \"height\": 640\n      }}\n    ]\n  }}\n}}\n"
                ),
            ),
            (
                "src-tauri/src/main.rs".to_string(),
                "#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]\n\nfn main() {\n    tauri::Builder::default()\n        .run(tauri::generate_context!())\n        .expect(\"error while running tauri application\");\n}\n".to_string(),
            ),
            (".gitignore".to_string(), "/src-tauri/target\nCargo.lock\n".to_string()),
        ],
        ProjectTemplateId::Bevy => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nbevy = \"0.14\"\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                "use bevy::prelude::*;\n\nfn main() {\n    App::new()\n        .add_plugins(DefaultPlugins)\n        .add_systems(Startup, setup)\n        .run();\n}\n\nfn setup(mut commands: Commands) {\n    commands.spawn(Camera2dBundle::default());\n}\n".to_string(),
            ),
            (".gitignore".to_string(), gitignore),
        ],
        ProjectTemplateId::Clap => vec![
            (
                "Cargo.toml".to_string(),
                format!(
                    "[package]\nname = \"{project_name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nclap = {{ version = \"4\", features = [\"derive\"] }}\n"
                ),
            ),
            (
                "src/main.rs".to_string(),
                format!(
                    "use clap::Parser;\n\n#[derive(Parser, Debug)]\n#[command(name = \"{project_name}\", version, about)]\nstruct Cli {{\n    #[arg(short, long, default_value = \"world\")]\n    name: String,\n}}\n\nfn main() {{\n    let cli = Cli::parse();\n    println!(\"Hello, {{}}!\", cli.name);\n}}\n"
                ),
            ),
            (".gitignore".to_string(), gitignore),
        ],
    }
}
