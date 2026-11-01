# Portraits

Put an image here named after a seat id and the room uses it in place of the drawn face, no restart needed (just refresh the page):

| File | Purpose |
|---|---|
| `hormozi.png` | Main portrait. **Required.** `.png`, `.jpg`, `.jpeg` or `.webp` all work. |
| `hormozi-talk.png` | Optional. Same image with the **mouth open**, used to animate speaking. |
| `hormozi-blink.png` | Optional. Same image with the **eyes closed**, used to blink. |

Seat ids: `martell`, `hormozi`, `buffett`, `bezos`, `garyvee`.

Without the talk frame, the portrait does a subtle head-bob while that advisor speaks.

**Image tips:** square (1024×1024 is ideal), head and shoulders, face centered in the upper half, plain dark or transparent background. The room crops it to a circle.

## Generating the 3D style

Use any image generator (ChatGPT, Midjourney, Ideogram, etc.). Upload a public photo of the person as a reference, then use this prompt with the description filled in:

> Stylized 3D animated character portrait in the style of a modern Pixar/DreamWorks film, of the man in the reference photo. Keep his likeness: face shape, hairstyle, facial hair, skin tone. Head-and-shoulders, facing the camera, friendly confident smile, soft studio lighting with warm key light and subtle rim light, smooth subsurface-scattered skin, slightly exaggerated proportions (bigger eyes, larger head). Plain dark navy background. Square 1:1, high detail. Wearing: **[OUTFIT]**.

Outfits that match each person's public look:

- **martell**: black crew-neck t-shirt
- **hormozi**: backwards grey trucker cap, long dark wavy hair, full beard, purple-blue plaid flannel over a cream t-shirt
- **buffett**: navy suit, white shirt, red tie, thick dark-rimmed glasses, white hair
- **bezos**: navy blazer over a light blue open-collar shirt, bald, big laugh
- **garyvee**: black t-shirt or hoodie, short dark hair, stubble

Then, for the talking and blinking frames, ask the same chat: *"Same image, identical in every way, but with the mouth open mid-word"*, and then *"…but with the eyes closed"*. Save them as `<id>-talk.png` and `<id>-blink.png`.

The room's footer already says these are simulated advisors. Keep that disclaimer if you share screenshots or videos.
