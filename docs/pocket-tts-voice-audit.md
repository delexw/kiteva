# Pocket TTS voice-group audit

Audited on 17 October 2026 against Pocket TTS 3.3.0. The shared catalog retains the exact upstream reference URI for every preset. Female/Male are audio-preset groups; names and third-party preset descriptions are not sufficient evidence.

The audit covered all 27 generated English presets, the default preset and Alba in each of the other six languages (39 generated samples), and 22 accessible original reference recordings. Five pinned multilingual original recordings required gated access, so their generated samples were checked without claiming the originals were inspected. Two independent local audio classifiers processed all 61 available samples. These are automated acoustic estimates, not verified identity information about the original speakers.

## Correction

Alba was incorrectly grouped as Female from a third-party voice table. Both classifiers classified its original casual reference and its generated samples in all seven languages as male-sounding. Alba is now in Male. Marius stays in Male: both classifiers support its original reference; the first classifier was borderline on the short generated English sample, while the second classified that sample as Male. No other preset needed a group change in this audit.

## Complete catalog

Scores below are model scores for the existing English runtime sample. They are not calibrated probabilities. The catalog grouping also considers original-reference evidence and the independent check.

| Preset         | Group  | First model: female / male | Second model: female / male |
| -------------- | ------ | -------------------------- | --------------------------- |
| Alba           | Male   | 0.001 / 0.999              | 0.009 / 0.989               |
| Marius         | Male   | 0.507 / 0.493              | 0.046 / 0.954               |
| Javert         | Male   | 0.001 / 0.999              | 0.000 / 1.000               |
| Jean           | Male   | 0.001 / 0.999              | 0.001 / 0.999               |
| Fantine        | Female | 0.996 / 0.004              | 0.994 / 0.006               |
| Cosette        | Female | 0.996 / 0.004              | 0.982 / 0.011               |
| Eponine        | Female | 0.996 / 0.004              | 0.979 / 0.020               |
| Azelma         | Female | 0.996 / 0.004              | 0.967 / 0.031               |
| Anna           | Female | 0.996 / 0.004              | 0.996 / 0.002               |
| Vera           | Female | 0.996 / 0.004              | 0.960 / 0.028               |
| Charles        | Male   | 0.001 / 0.999              | 0.003 / 0.997               |
| Paul           | Male   | 0.001 / 0.999              | 0.000 / 0.902               |
| George         | Male   | 0.001 / 0.999              | 0.000 / 0.999               |
| Mary           | Female | 0.996 / 0.004              | 0.976 / 0.020               |
| Jane           | Female | 0.996 / 0.004              | 0.983 / 0.012               |
| Michael        | Male   | 0.001 / 0.999              | 0.003 / 0.995               |
| Eve            | Female | 0.996 / 0.004              | 0.982 / 0.016               |
| Bill Boerst    | Male   | 0.001 / 0.999              | 0.000 / 1.000               |
| Peter Yearsley | Male   | 0.001 / 0.999              | 0.000 / 1.000               |
| Stuart Bell    | Male   | 0.001 / 0.999              | 0.000 / 0.992               |
| Caro Davy      | Female | 0.996 / 0.004              | 0.956 / 0.044               |
| Estelle        | Female | 0.996 / 0.004              | 0.951 / 0.043               |
| Juergen        | Male   | 0.001 / 0.999              | 0.000 / 1.000               |
| Rafael         | Male   | 0.001 / 0.999              | 0.000 / 1.000               |
| Giovanni       | Male   | 0.001 / 0.999              | 0.002 / 0.998               |
| Lola           | Female | 0.996 / 0.004              | 0.938 / 0.045               |
| Daan           | Male   | 0.001 / 0.999              | 0.000 / 1.000               |

## Reproducibility and source checks

The original mappings were read from the installed package’s `_ORIGINS_OF_PREDEFINED_VOICES`. VCTK reference IDs were checked against speaker metadata, Jean against the [EARS speaker statistics](https://github.com/facebookresearch/ears_dataset/blob/main/speaker_statistics.json), and the four Voice-Zero references against its [source inventory](https://github.com/OwenTyme/voice-zero/blob/main/voices/README.md). Automated checks use each model’s declared label order, with known VCTK female and male references as controls.

- [prithivMLmods/Common-Voice-Gender-Detection](https://huggingface.co/prithivMLmods/Common-Voice-Gender-Detection/tree/ebbf41293c8dbea45c5bb0de6e3ef77bf89cc2ee), revision `ebbf41293c8dbea45c5bb0de6e3ef77bf89cc2ee`.
- [audeering/wav2vec2-large-robust-6-ft-age-gender](https://huggingface.co/audeering/wav2vec2-large-robust-6-ft-age-gender/tree/a681b720dafd12b9dd7b6d13fb437c7b6b197fd3), revision `a681b720dafd12b9dd7b6d13fb437c7b6b197fd3`.

Reference audio was decoded to mono 16 kHz PCM, capped at 12 seconds per sample. Classification ran locally on CPU. The audit did not alter synthesis, voice IDs, installed speech models, language support or saved selections. Classifiers, downloaded reference audio and generated audit artifacts remained in a temporary folder outside the repository; no classifier is added to Kiteva’s runtime.
