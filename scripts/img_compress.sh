#!/bin/bash

# ==========================================================
# Professional Image Optimization Script
#
# Features:
# - Respects .gitignore patterns if run inside a Git repository.
# - Skips already optimized files ('_optimized' suffix).
# - Provides a final summary of successes and failures.
# - Uses 'tr' for lowercase conversion for maximum compatibility.
# - Uses 'magick' (ImageMagick) for optimization.
# ==========================================================

# --- Configuration ---
JPEG_QUALITY=70

# --- State Counters ---
# We initialize these *before* the loop.
success_count=0
fail_count=0

# ==========================================================
# Helper Function: Process a Single Image
#
# This function is called for each file found.
# Using a function makes the main loop cleaner.
# ==========================================================
process_image() {
    # $1 is the first argument passed to the function (the file path)
    local FILE="$1"
    
    # --- 1. Get File Components ---
    local DIRNAME=$(dirname "${FILE}")
    local BASENAME=$(basename "${FILE}")
    local FILENAME_WITHOUT_EXT="${BASENAME%.*}"
    local EXTENSION="${BASENAME##*.}"
    
    # --- 2. Define Formatted Target File ---
    local OPTIMIZED_FILE="${DIRNAME}/${FILENAME_WITHOUT_EXT}.${EXTENSION}"

    # --- 3. Get Compatible Lowercase Extension ---
    # Replaces '${EXTENSION,,}' for compatibility with older Bash/sh
    local EXT_LOWER=$(echo "${EXTENSION}" | tr '[:upper:]' '[:lower:]')

    # --- 4. Process Based on File Type ---
    local cmd_success=false
    local result_msg=""
    
    case "${EXT_LOWER}" in
        jpg|jpeg)
            if magick "${FILE}" -strip -quality ${JPEG_QUALITY} "${OPTIMIZED_FILE}"; then
                cmd_success=true
                result_msg="Optimized (JPG)"
            else
                result_msg="Error (JPG)"
            fi
            ;;
        png)
            if magick "${FILE}" -strip -define png:compression-level=9 "${OPTIMIZED_FILE}"; then
                cmd_success=true
                result_msg="Optimized (PNG)"
            else
                result_msg="Error (PNG)"
            fi
            ;;
        *)
            result_msg="Skipped (Unknown Type)"
            ;;
    esac

    # --- 5. Report Status and Update Counters ---
    if $cmd_success; then
        # Formatted output for alignment
        printf "  %-20s -> %s\n" "[${result_msg}]" "${OPTIMIZED_FILE}"
        success_count=$((success_count + 1))
    else
        # Print errors to stderr
        printf "  %-20s -> %s\n" "[${result_msg}]" "${FILE}" >&2
        fail_count=$((fail_count + 1))
        # Clean up failed/empty file if it was created
        rm -f "${OPTIMIZED_FILE}"
    fi
}

# ==========================================================
# Main Script Execution
# ==========================================================

# --- 1. Dependency Check ---
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick (command 'magick') is not installed." >&2
    echo "Please install it to use this script (e.g., 'sudo apt install imagemagick')." >&2
    exit 1
fi

echo "Starting image optimization..."
echo "JPEG Quality: ${JPEG_QUALITY}%"

# --- 2. File Discovery Strategy ---

# We use process substitution (< <(...)) to pipe output into our 'while'
# loop. This is critical for ensuring the 'success_count' and
# 'fail_count' variables are not lost in a subshell.

if command -v git &> /dev/null && [ -d ".git" ]; then
    # --- STRATEGY A: Git Repository ---
    # Use 'git ls-files' to get all tracked or untracked files,
    # automatically excluding anything in .gitignore.
    echo "Git repository detected. Respecting .gitignore rules..."
    
    while IFS= read -r -d $'\0' FILE; do
        # We still must manually skip files we already optimized
        if [[ "${FILE}" != *"_optimized."* ]]; then
            process_image "${FILE}"
        fi
    done < <(git ls-files -z --cached --others --exclude-standard -- \
             '*.jpg' '*.jpeg' '*.png' '*.JPG' '*.JPEG' '*.PNG')

else
    # --- STRATEGY B: Standard Directory (No Git) ---
    # Fall back to 'find'. This will not read .gitignore.
    echo "Not a Git repository. Using 'find'..."
    if [ -f ".gitignore" ]; then
        echo "Warning: .gitignore file found, but it will be IGNORED." >&2
    fi

    while IFS= read -r -d $'\0' FILE; do
        process_image "${FILE}"
    done < <(find . -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) \
                   -not -iname "*_optimized.*" -print0)
fi

# --- 3. Final Summary ---
echo "---"
echo "Image optimization complete."
echo "Summary: ${success_count} files optimized, ${fail_count} files failed."

# Provide a non-zero exit code if any failures occurred
if [ ${fail_count} -gt 0 ]; then
    exit 1
fi
exit 0