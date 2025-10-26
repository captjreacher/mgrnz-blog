#!/bin/bash
echo "🚨 EMERGENCY BUILD SCRIPT RUNNING 🚨"
echo "Hugo version:"
hugo version
echo "Building site..."
hugo --gc --minify --verbose
echo "Build complete!"
echo "Generated files:"
ls -la public/
echo "🚨 BUILD SCRIPT COMPLETE 🚨"