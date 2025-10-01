# AI Live Painting Backend - Modal.com Deployment

This backend uses **Stable Diffusion XL + ControlNet** to transform painted/sketched images into photorealistic images.

## Features

- 🎨 **Best-in-class models**: Uses SDXL (Stable Diffusion XL) with ControlNet for superior quality
- ⚡ **Fast inference**: Optimized with VAE slicing, tiling, and DPM++ scheduler
- 🚀 **Serverless**: Deploys on Modal.com with automatic scaling
- 💰 **Cost-effective**: Only pays for GPU time when processing
- 🔥 **GPU-accelerated**: Uses A10G GPU (24GB VRAM)

## Models Used

1. **Stable Diffusion XL 1.0** - The best open-source image generation model
2. **ControlNet Canny** - Preserves structure from input painted image
3. **SDXL VAE FP16** - Improved VAE for better quality and stability

## Setup

### 1. Install Modal

```bash
pip install -r requirements.txt
```

### 2. Create Modal Account

```bash
# Sign up at modal.com, then authenticate
modal token new
```

### 3. Deploy to Modal

```bash
modal deploy modal_app.py
```

This will:
- Download all models (~20GB)
- Create a persistent volume for model caching
- Deploy the web endpoint

### 4. Get Your Deployment URL

After deployment, Modal will give you a URL like:
```
https://your-username--ai-live-painting-fastapi-app.modal.run
```

Update your `.env` file (don't include `/process` - that's added automatically):
```env
AI_LIVE_PAINT_URL=https://your-username--ai-live-painting-fastapi-app.modal.run
```

## API Usage

### Endpoint

```
POST https://your-app--ai-live-painting-fastapi-app.modal.run/process
```

### Request

**Content-Type:** `multipart/form-data`

**Parameters:**
- `image` (required): The painted/sketched image file
- `prompt` (optional): Text description to guide generation
  - Default: "professional photograph, highly detailed, 8k, sharp focus, realistic lighting, photorealistic"
- `strength` (optional): How strongly to apply the effect (0.3-1.0)
  - Default: 0.8
  - Lower = more creative freedom
  - Higher = stricter adherence to input structure

### Example with curl

```bash
curl -X POST https://your-app--ai-live-painting-fastapi-app.modal.run/process \
  -F "image=@painting.png" \
  -F "prompt=beautiful sunset landscape, mountains in background, photorealistic" \
  -F "strength=0.8" \
  --output result.png
```

### Example with Python

```python
import requests

url = "https://your-app--ai-live-painting-fastapi-app.modal.run/process"

with open("painting.png", "rb") as f:
    files = {"image": f}
    data = {
        "prompt": "beautiful sunset landscape, photorealistic",
        "strength": "0.8"
    }
    response = requests.post(url, files=files, data=data)

with open("result.png", "wb") as f:
    f.write(response.content)
```

## Local Testing

Test the model locally before deploying:

```bash
modal run modal_app.py
```

This will create a test image and process it.

## Performance

- **Cold start**: ~30-60 seconds (first request after idle)
- **Warm inference**: ~5-10 seconds per image
- **Container idle timeout**: 5 minutes (keeps GPU warm)
- **Max concurrent requests**: 10

## Cost Estimation

Modal pricing (approximate):
- A10G GPU: ~$1.10/hour
- Processing time: ~5-10 seconds per image
- Cost per image: ~$0.002-0.004 (less than half a cent!)

## Customization

### Change GPU Type

Edit `modal_app.py` line 67:
```python
gpu="A10G",  # Options: T4, A10G, A100
```

### Adjust Quality/Speed

In `modal_app.py`, the `process_image` method has these parameters:
- `num_inference_steps`: 30 (default) - Higher = better quality but slower
- `guidance_scale`: 7.5 (default) - How closely to follow the prompt
- `controlnet_conditioning_scale`: 0.8 (default) - Structure preservation

### Use Different Models

You can swap models in the `download_models()` and `load_models()` functions:

**For more artistic style:**
```python
"stabilityai/stable-diffusion-xl-base-1.0"
# Replace with:
"RunDiffusion/Juggernaut-XL-v9"
```

**For anime/illustration:**
```python
"Linaqruf/animagine-xl-3.1"
```

## Monitoring

View logs and metrics in Modal dashboard:
```bash
modal app logs ai-live-painting
```

## Troubleshooting

### Out of Memory Error
- Reduce image size or use smaller GPU
- The code auto-resizes to 1024x1024 max

### Slow Cold Starts
- Models are cached in persistent volume
- Consider using Modal's "keep warm" feature for production

### Poor Quality Output
- Increase `num_inference_steps` (try 40-50)
- Adjust `prompt` to be more descriptive
- Try different `strength` values

## Development Workflow

1. **Local testing**: `modal run modal_app.py`
2. **Deploy dev**: `modal deploy modal_app.py`
3. **Test endpoint**: Use curl or your Node.js app
4. **Monitor**: Check Modal dashboard for errors
5. **Iterate**: Adjust parameters and redeploy

## Production Checklist

- [ ] Test with various input images
- [ ] Set up Modal secrets for API keys (if needed)
- [ ] Configure auto-scaling limits
- [ ] Set up monitoring and alerts
- [ ] Add rate limiting on your Node.js backend
- [ ] Consider adding image validation/sanitization

## Advanced: Custom ControlNet

To use different ControlNet models (depth, pose, scribble, etc.):

```python
# In download_models() and load_models()
controlnet = ControlNetModel.from_pretrained(
    "diffusers/controlnet-depth-sdxl-1.0",  # or other variants
    torch_dtype=torch.float16,
    cache_dir=MODEL_DIR,
)
```

Available ControlNet types:
- `controlnet-canny-sdxl-1.0` - Edge detection (current)
- `controlnet-depth-sdxl-1.0` - Depth map
- `controlnet-scribble-sdxl-1.0` - Scribbles/sketches
- `controlnet-openpose-sdxl-1.0` - Human pose

## License

This code uses open-source models:
- SDXL: CreativeML Open RAIL++-M License
- ControlNet: Apache 2.0 License

Make sure to comply with their licenses for commercial use.
