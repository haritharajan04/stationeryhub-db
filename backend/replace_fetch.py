import re

with open('../frontend/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# We replace " fetch(" with " customFetch(" and "await fetch(" with "await customFetch("
# Let's use regex to replace fetch( except if it's "return fetch("
new_code = re.sub(r'(?<!return )fetch\(', 'customFetch(', code)

with open('../frontend/app.js', 'w', encoding='utf-8') as f:
    f.write(new_code)

print("Successfully replaced all fetch calls in app.js!")
