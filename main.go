package main

import (
	"embed"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
)

//go:embed index.html style.css app.js
var webFiles embed.FS

func main() {
	sub, err := fs.Sub(webFiles, ".")
	if err != nil {
		log.Fatalf("nem sikerült betölteni a beágyazott fájlokat: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(sub)))

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("nem sikerült portot nyitni: %v", err)
	}

	url := "http://" + listener.Addr().String()
	log.Printf("SQL Formattáló indul: %s", url)
	openBrowser(url)

	if err := http.Serve(listener, mux); err != nil {
		log.Fatalf("szerver hiba: %v", err)
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}

	_ = cmd.Start()
}
