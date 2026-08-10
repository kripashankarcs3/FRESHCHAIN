import logging
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    from torchvision import transforms
    from PIL import Image
except ImportError as exc:
    torch = None
    nn = None
    transforms = None
    Image = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

classes = ["fresh", "rotten"]
_model = None


if nn is not None:
    class CNN(nn.Module):
        def __init__(self):
            super(CNN, self).__init__()

            self.conv = nn.Sequential(
                nn.Conv2d(3, 16, 3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2),
                nn.Conv2d(16, 32, 3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2),
            )

            self.fc = nn.Sequential(
                nn.Flatten(),
                nn.Linear(32 * 56 * 56, 128),
                nn.ReLU(),
                nn.Linear(128, 2),
            )

        def forward(self, x):
            x = self.conv(x)
            x = self.fc(x)
            return x
else:
    CNN = None


transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
]) if transforms is not None else None


def _load_model():
    global _model

    if _model is not None:
        return _model

    if torch is None:
        raise ImportError(
            "torch/torchvision is not installed. Install Python 3.11 and run pip install -r requirements.txt"
        ) from _IMPORT_ERROR

    model_path = Path(__file__).with_name("model.pth")
    model = CNN()

    if not model_path.exists():
        logger.warning("model.pth not found at %s; using dummy predictions", model_path)
        _model = None
        return None

    try:
        state_dict = torch.load(model_path, map_location=torch.device("cpu"))
        model.load_state_dict(state_dict)
        model.eval()
        _model = model
        logger.info("Model loaded from %s", model_path)
        return _model
    except Exception as exc:
        logger.exception("Failed to load model.pth; using dummy predictions")
        _model = None
        return None


def predict_image(img_path):
    if torch is None or transform is None or Image is None:
        logger.error("torch/pillow imports unavailable; returning fallback prediction")
        return "fresh"

    try:
        model = _load_model()

        image = Image.open(img_path).convert("RGB")
        image = transform(image).unsqueeze(0)

        if model is None:
            return "fresh"

        with torch.no_grad():
            outputs = model(image)
            _, predicted = torch.max(outputs, 1)

        return classes[predicted.item()]
    except Exception:
        logger.exception("Prediction failed for %s; returning fallback prediction", img_path)
        return "fresh"


if __name__ == "__main__":
    img_path = input("Enter image path: ")
    result = predict_image(img_path)
    print("Prediction:", result)