#!/bin/bash

# Function that returns the sum of two numbers
add() {
    local a=$1
    local b=$2
    echo $((a + b))
}

# Example usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    result=$(add 3 5)
    echo "add(3, 5) = $result"
fi
