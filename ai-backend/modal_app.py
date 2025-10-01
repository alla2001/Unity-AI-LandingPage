"""
AI Live Painting Backend - Modal.com Deployment
Uses DreamShaper 8 (SD 1.5 fine-tune) for painted-to-realistic image transformation
"""

import modal
import io
from pathlib import Path

# Define Modal app
app = modal.App("ai-live-painting")

# Create Modal image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")  # Required for OpenCV
    .pip_install(
        "torch==2.1.0",
        "torchvision==0.16.0",
        "diffusers==0.27.2",
        "transformers==4.38.0",
        "accelerate==0.27.0",
        "safetensors==0.4.2",
        "huggingface-hub==0.21.0",
        "opencv-python-headless==4.9.0.80",
        "pillow==10.2.0",
        "numpy==1.26.4",
        "controlnet-aux==0.0.7",
        "fastapi==0.109.0",
        "python-multipart==0.0.9",
    )
)

# Model cache directory (will be mounted as volume)
MODEL_DIR = "/cache"


@app.cls(
    image=image,
    gpu="A10G",  # Use A10G GPU (24GB VRAM) - good balance of performance and cost
    timeout=600,  # 10 minute timeout
)
class AILivePainting:
    @modal.enter()
    def load_models(self):
        """Load models when container starts"""
        import torch
        from diffusers import StableDiffusionImg2ImgPipeline

        print("🚀 Loading DreamShaper 8 Img2Img (paint-to-realistic)...")

        # Load DreamShaper 8 img2img pipeline
        self.pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "Lykon/DreamShaper-8",
            torch_dtype=torch.float16,
            safety_checker=None
        )

        # Move to GPU
        self.pipe.to("cuda")

        print("✅ DreamShaper 8 Img2Img loaded and ready!")

    @modal.method()
    def process_image(
        self,
        image_bytes: bytes,
        prompt: str = "professional photograph, highly detailed, photorealistic",
        strength: float = 0.75,
        steps: int = 30,
        guidance: float = 7.5,
    ) -> bytes:
        """
        Transform a painted image into a realistic photograph using img2img
        Uses your painted colors to guide the generation

        Args:
            image_bytes: Input image as bytes
            prompt: Text description to guide the generation
            strength: Denoising strength (0.6-0.85 recommended, higher = more transformation)
            steps: Number of inference steps (20-50 recommended)
            guidance: Guidance scale (7.5-12.0 recommended, higher = follow prompt more closely)

        Returns:
            Processed image as PNG bytes
        """
        import torch
        from PIL import Image

        print(f"📥 Processing with DreamShaper 8 - prompt: '{prompt}', strength: {strength}, steps: {steps}, guidance: {guidance}")

        # Load input image
        input_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        input_image = input_image.resize((512, 512), Image.Resampling.LANCZOS)

        print(f"🎨 Generating realistic image from painting with DreamShaper 8...")

        # Generate image with img2img
        # Your painted colors guide the generation
        with torch.cuda.amp.autocast():
            result = self.pipe(
                prompt=prompt,
                image=input_image,
                strength=strength,
                guidance_scale=guidance,
                num_inference_steps=steps,
                width=512,
                height=512
            )

        result_image = result.images[0]

        # Convert to bytes
        img_byte_arr = io.BytesIO()
        result_image.save(img_byte_arr, format='PNG', optimize=True)
        img_byte_arr.seek(0)

        print("✅ Image processing complete!")
        return img_byte_arr.getvalue()


@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    """FastAPI app for handling requests"""
    from fastapi import FastAPI, File, UploadFile, Form, HTTPException
    from fastapi.responses import Response
    import json

    web_app = FastAPI()

    @web_app.post("/process")
    async def process_endpoint(
        image: UploadFile = File(...),
        prompt: str = Form("professional photograph, highly detailed, photorealistic"),
        strength: float = Form(0.75),
        steps: int = Form(30),
        guidance: float = Form(7.5)
    ):
        """
        Process a painted image and convert to photorealistic using img2img

        Args:
            image: The painted/sketched image file
            prompt: Text description to guide generation
            strength: Denoising strength (0.6-0.85 recommended)
            steps: Number of inference steps (20-50 recommended)
            guidance: Guidance scale (7.5-12.0 recommended)
        """
        try:
            # Read image bytes
            image_bytes = await image.read()

            # Validate parameters
            strength = max(0.4, min(0.95, strength))
            steps = max(15, min(100, steps))
            guidance = max(5.0, min(15.0, guidance))

            # Process image
            model = AILivePainting()
            result_bytes = model.process_image.remote(
                image_bytes=image_bytes,
                prompt=prompt,
                strength=strength,
                steps=steps,
                guidance=guidance,
            )

            # Return processed image
            return Response(
                content=result_bytes,
                media_type="image/png",
                headers={
                    "X-Processing-Status": "success",
                    "X-Model": "DreamShaper-8",
                }
            )

        except Exception as e:
            print(f"❌ Error processing image: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Processing failed: {str(e)}"
            )

    return web_app


# Local testing endpoint
@app.local_entrypoint()
def test():
    """Test the model locally"""
    print("🧪 Testing AI Live Painting model...")

    # Create a simple test image
    from PIL import Image, ImageDraw
    import io

    # Create a simple painted-style test image
    img = Image.new('RGB', (512, 512), color='white')
    draw = ImageDraw.Draw(img)

    # Draw some simple shapes
    draw.rectangle([100, 100, 400, 400], fill='lightblue', outline='blue', width=3)
    draw.ellipse([150, 150, 350, 350], fill='lightcoral', outline='red', width=3)

    # Convert to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)

    # Process with DreamShaper 8
    model = AILivePainting()
    result = model.process_image.remote(
        image_bytes=img_bytes.getvalue(),
        prompt="modern architecture, blue building with red dome, professional photograph, 8k, highly detailed"
    )

    # Save result
    with open("test_output.png", "wb") as f:
        f.write(result)

    print("✅ Test complete! Check test_output.png")
