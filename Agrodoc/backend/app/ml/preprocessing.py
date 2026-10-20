"""Image preprocessing shared by training-compatible inference code."""
from PIL import Image, ImageOps
import torch
from torchvision import transforms

IMAGE_SIZE = (224, 224)
_MEAN = [0.485, 0.456, 0.406]
_STD = [0.229, 0.224, 0.225]

transform_pipeline = transforms.Compose([
    transforms.Resize(IMAGE_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=_MEAN, std=_STD),
])


def preprocess_image(image: Image.Image) -> torch.Tensor:
    """Convert a PIL image to normalized NCHW tensor; respect EXIF orientation.

    Alpha/grayscale/palette images are converted to RGB to keep inference input
    shape stable. The returned tensor includes a batch dimension.
    """
    if not isinstance(image, Image.Image):
        raise TypeError("image must be a PIL.Image.Image instance")
    image = ImageOps.exif_transpose(image)
    rgb_image = image.convert("RGB")
    tensor = transform_pipeline(rgb_image)
    if tensor.shape != (3, IMAGE_SIZE[0], IMAGE_SIZE[1]):
        raise ValueError(f"Unexpected preprocessed image shape: {tuple(tensor.shape)}")
    if not torch.isfinite(tensor).all():
        raise ValueError("Image preprocessing produced non-finite values")
    return tensor.unsqueeze(0)
